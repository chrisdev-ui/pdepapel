import { Prisma, type SocialEarlyAlertKind, type SocialPlatform } from "@prisma/client";

import { PanelNotice } from "@/emails/panel-notice";
import { deliverEmails } from "@/lib/email-delivery";
import { colombiaDay, colombiaDaysRange } from "@/lib/order-list-filters";
import prismadb from "@/lib/prismadb";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";

import { EARLY_DAILY_EMAILS, EARLY_MAX_HOURS, EARLY_MIN_HISTORY, earlyAlertCopy, earlyHistoryCount, earlyVerdict } from "./early-alert-rules";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";
const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface EarlyAlertRun {
  /** off: pausada desde el panel; waiting: la red todavía no junta 10 publicaciones de historia. */
  status: "off" | "waiting" | "done";
  created: number;
  emailed: number;
}

/** El interruptor de emergencia de la tienda (StoreSettings); sin fila cuenta como encendido. */
export async function isEarlyAlertSwitchOn(storeId: string) {
  const settings = await prismadb.storeSettings.findUnique({ where: { storeId }, select: { socialEarlyAlertEnabled: true } });
  return settings?.socialEarlyAlertEnabled ?? true;
}

export async function setEarlyAlertSwitch(storeId: string, enabled: boolean) {
  await prismadb.storeSettings.upsert({ where: { storeId }, create: { storeId, socialEarlyAlertEnabled: enabled }, update: { socialEarlyAlertEnabled: enabled } });
}

/**
 * Después de cada refresco de la hora (una cuenta): las publicaciones de 2–6 h
 * sin alerta se comparan con su red a la misma edad. Se enciende sola por red
 * al juntar 10 publicaciones con lectura a las 2–6 h; el interruptor de la
 * tienda solo la pausa. Crear la fila reclama la alerta (única por
 * publicación); el correo respeta el tope de 3 al día.
 */
export async function evaluateEarlyAlerts(accountId: string, options: { now?: Date } = {}): Promise<EarlyAlertRun> {
  const now = options.now ?? new Date();
  const account = await prismadb.socialAccount.findUnique({ where: { id: accountId }, select: { storeId: true, platform: true } });
  if (!account) return { status: "done", created: 0, emailed: 0 };
  if (!(await isEarlyAlertSwitchOn(account.storeId))) return { status: "off", created: 0, emailed: 0 };
  const posts = await prismadb.socialPost.findMany({
    where: { socialAccountId: accountId, postedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    select: { id: true, caption: true, postedAt: true, earlyAlert: { select: { id: true } }, snapshots: { orderBy: { capturedAt: "asc" }, select: { hoursSincePost: true, views: true } } },
  });

  if (earlyHistoryCount(posts.map((post) => post.snapshots)) < EARLY_MIN_HISTORY) return { status: "waiting", created: 0, emailed: 0 };

  let created = 0;
  let emailed = 0;
  for (const post of posts) {
    // Solo lo publicado hace 7 h o menos: al encender la alerta no avisa de publicaciones viejas.
    if (post.earlyAlert || now.getTime() - post.postedAt.getTime() > (EARLY_MAX_HOURS + 1) * HOUR) continue;
    const latest = post.snapshots.filter((snapshot) => snapshot.views !== null).at(-1);
    if (!latest) continue;
    const verdict = earlyVerdict(latest, posts.filter((other) => other.id !== post.id).map((other) => other.snapshots));
    if (!verdict?.kind || verdict.ratio === null) continue;
    const alert = await claimEarlyAlert({ storeId: account.storeId, socialPostId: post.id, kind: verdict.kind, ratio: verdict.ratio, hoursSincePost: verdict.hours });
    if (!alert) continue;
    created += 1;
    if (await emailEarlyAlert({ ...alert, storeId: account.storeId, platform: account.platform, caption: post.caption }, now)) emailed += 1;
  }
  return { status: "done", created, emailed };
}

async function claimEarlyAlert(data: { storeId: string; socialPostId: string; kind: SocialEarlyAlertKind; ratio: number; hoursSincePost: number }) {
  try {
    return await prismadb.socialEarlyAlert.create({ data, select: { id: true, kind: true, ratio: true, hoursSincePost: true } });
  } catch (error) {
    // Otra corrida ya la reclamó: no se repite.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

/**
 * Reserva el correo con una sola sentencia (tope de 3 por día de Bogotá) y lo
 * libera si no sale. Sin destinatarios, la alerta queda solo en Inicio.
 */
async function emailEarlyAlert(alert: { id: string; storeId: string; platform: SocialPlatform; kind: SocialEarlyAlertKind; ratio: number; hoursSincePost: number; caption: string | null }, now: Date) {
  const dayStart = colombiaDaysRange(colombiaDay(now), colombiaDay(now)).start;
  const reserved = await prismadb.$executeRaw`UPDATE \`SocialEarlyAlert\` SET \`emailedAt\` = ${now} WHERE \`id\` = ${alert.id} AND \`emailedAt\` IS NULL AND (SELECT \`n\` FROM (SELECT COUNT(*) AS \`n\` FROM \`SocialEarlyAlert\` WHERE \`storeId\` = ${alert.storeId} AND \`emailedAt\` >= ${dayStart}) AS \`today\`) < ${EARLY_DAILY_EMAILS}`;
  if (reserved !== 1) return false;
  const release = () => prismadb.socialEarlyAlert.updateMany({ where: { id: alert.id }, data: { emailedAt: null } });
  try {
    const to = await getAdminNotificationRecipients(alert.storeId);
    if (to.length === 0) {
      await release();
      return false;
    }
    const copy = earlyAlertCopy(alert);
    const link = `${PANEL_ORIGIN}/${alert.storeId}/redes`;
    const piece = alert.caption ? `«${alert.caption.replace(/\s+/g, " ").trim().slice(0, 80)}»` : "La publicación";
    const { resend } = await import("@/lib/resend");
    const outcomes = await deliverEmails(
      [
        {
          role: "admin",
          send: () =>
            resend.emails.send({
              from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
              to,
              subject: `${alert.kind === "DESPEGANDO" ? "🚀" : "🐢"} ${copy.title}`,
              react: PanelNotice({
                preview: copy.title,
                label: "Panel · Métricas de redes",
                title: copy.title,
                summary: `${piece}: ${copy.summary}`,
                action: copy.action,
                cta: { href: link, label: "Ir a Métricas de redes" },
              }) as React.ReactElement,
              text: `${copy.title}. ${piece}: ${copy.summary} ${copy.action} Más en ${link}`,
            }),
        },
      ],
      { storeId: alert.storeId, kind: "social:early-alert" },
    );
    if (outcomes.admin?.ok) return true;
    await release();
    return false;
  } catch (error) {
    await release();
    console.error("[SOCIAL] No se pudo avisar la alerta temprana:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

/** Las alertas de las últimas 24 h, para la tarjeta de Inicio. */
export async function getRecentEarlyAlerts(storeId: string, now = new Date()) {
  const rows = await prismadb.socialEarlyAlert.findMany({
    where: { storeId, createdAt: { gte: new Date(now.getTime() - DAY) } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, kind: true, ratio: true, hoursSincePost: true, createdAt: true, post: { select: { platform: true, caption: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    ratio: row.ratio,
    hoursSincePost: row.hoursSincePost,
    createdAt: row.createdAt.toISOString(),
    platform: row.post.platform,
    caption: row.post.caption ? row.post.caption.replace(/\s+/g, " ").trim().slice(0, 80) : null,
  }));
}

export type RecentEarlyAlert = Awaited<ReturnType<typeof getRecentEarlyAlerts>>[number];
