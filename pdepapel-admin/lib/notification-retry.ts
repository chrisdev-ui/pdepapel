import type { PrismaClient } from "@prisma/client";

import { EMAIL_ROLES, type DeliveryOutcome, type EmailRole } from "@/lib/email-delivery";
import prismadb from "@/lib/prismadb";

/**
 * Barrido de correos de pedido que no salieron (FailedNotification), desde
 * «Admin scheduled tasks».
 *
 * Sin cambiar el esquema:
 * - Cada intento fallido es una fila (`recipient` = rol: "admin" o
 *   "customer"; las filas anteriores a este cambio guardaban la dirección y
 *   valen para los dos roles).
 * - Para tomar una fila se marca `resolvedAt` con un único UPDATE condicionado
 *   a que siga sin resolver: si dos corridas coinciden, solo una la toma y
 *   solo una manda el correo. Si el reenvío falla, se deja una fila nueva para
 *   el siguiente barrido.
 * - Los intentos se cuentan por pedido + tipo + rol (todas sus filas). Con
 *   `MAX_EMAIL_ATTEMPTS` cumplido la fila queda sin resolver y a la vista,
 *   pero ya no se reintenta.
 * - Solo se miran las últimas `RETRY_WINDOW_HOURS`: un aviso de hace una
 *   semana ya no sirve.
 * - Si el pedido cambió de estado desde el aviso perdido (un «Pendiente» que
 *   ya está «Pagado»), no se manda un aviso viejo: la fila se da por resuelta.
 *
 * Solo correos. Las guías de EnvioClick (canal GUIDE) nunca se reintentan
 * aquí: se pagan al crearlas (lib/guide-background.ts).
 */
export const RETRY_WINDOW_HOURS = 48;
/** El fallo original más hasta tres reenvíos. */
export const MAX_EMAIL_ATTEMPTS = 4;

type Db = Pick<PrismaClient, "failedNotification" | "order" | "$executeRaw">;

type SendFn = (
  order: never,
  status: never,
  options: { roles: EmailRole[]; recordFailures: false },
) => Promise<Partial<Record<EmailRole, DeliveryOutcome>> | void>;

export interface RetryDependencies {
  db?: Db;
  now?: Date;
  limit?: number;
  sendOrderEmail?: SendFn;
  sendShippingEmail?: SendFn;
}

export interface RetrySummary {
  scanned: number;
  sent: { orderId: string; kind: string; role: EmailRole }[];
  failed: { orderId: string; kind: string; role: EmailRole; error: string }[];
  superseded: number;
  exhausted: number;
  alreadyClaimed: number;
}

const isRole = (value: string | null): value is EmailRole => value === "admin" || value === "customer";

export function parseNotificationKind(kind: string): { type: "order" | "shipping"; status: string } | null {
  const match = /^(order|shipping):(.+)$/.exec(kind);
  return match ? { type: match[1] as "order" | "shipping", status: match[2] } : null;
}

export async function retryFailedNotifications(deps: RetryDependencies = {}): Promise<RetrySummary> {
  const db = deps.db ?? prismadb;
  const now = deps.now ?? new Date();
  const limit = deps.limit ?? 25;
  const sendOrder = deps.sendOrderEmail ?? ((await import("@/lib/email")).sendOrderEmail as unknown as SendFn);
  const sendShipping = deps.sendShippingEmail ?? ((await import("@/lib/email")).sendShippingEmail as unknown as SendFn);
  const since = new Date(now.getTime() - RETRY_WINDOW_HOURS * 60 * 60 * 1000);

  const summary: RetrySummary = { scanned: 0, sent: [], failed: [], superseded: 0, exhausted: 0, alreadyClaimed: 0 };
  const rows = await db.failedNotification.findMany({
    where: {
      channel: "EMAIL",
      resolvedAt: null,
      orderId: { not: null },
      createdAt: { gte: since },
      OR: [{ kind: { startsWith: "order:" } }, { kind: { startsWith: "shipping:" } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const row of rows) {
    summary.scanned += 1;
    const parsed = parseNotificationKind(row.kind);
    const orderId = row.orderId!;
    if (!parsed) continue;

    // Cuántas veces se intentó ya cada rol (todas las filas de ese pedido y tipo).
    const history = await db.failedNotification.findMany({
      where: { orderId, kind: row.kind, channel: "EMAIL" },
      select: { recipient: true },
    });
    const attemptsFor = (role: EmailRole) => history.filter((h) => h.recipient === role || !isRole(h.recipient)).length;
    const candidateRoles = isRole(row.recipient) ? [row.recipient] : [...EMAIL_ROLES];
    const roles = candidateRoles.filter((role) => attemptsFor(role) < MAX_EMAIL_ATTEMPTS);
    if (roles.length === 0) {
      summary.exhausted += 1;
      continue;
    }

    // Tomar la fila: solo una corrida gana. Una sola sentencia y no
    // `updateMany`: Prisma lo parte en un SELECT con la guarda y un UPDATE por
    // id sin ella, y fuera de una transacción dos corridas se la quedarían
    // las dos (AGENTS.md, «Payments and webhooks»; lib/atomic-claim.ts).
    const claimed = await db.$executeRaw`UPDATE \`FailedNotification\` SET \`resolvedAt\` = ${now} WHERE \`id\` = ${row.id} AND \`resolvedAt\` IS NULL`;
    if (claimed !== 1) {
      summary.alreadyClaimed += 1;
      continue;
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { payment: true, shipping: true, orderItems: { include: { product: true } } },
    });
    const current = parsed.type === "order" ? order?.status : order?.shipping?.status;
    if (!order || current !== parsed.status) {
      // El pedido ya no existe o cambió de estado: ese aviso ya no aplica.
      summary.superseded += 1;
      continue;
    }

    const send = parsed.type === "order" ? sendOrder : sendShipping;
    const emailOrder = { ...order, payment: order.payment?.method ?? null } as never;
    let outcomes: Partial<Record<EmailRole, DeliveryOutcome>> | void;
    try {
      outcomes = await send(emailOrder, parsed.status as never, { roles, recordFailures: false });
    } catch (error) {
      outcomes = Object.fromEntries(
        roles.map((role) => [role, { ok: false, attempts: 0, error: String(error), retryable: true }]),
      ) as Partial<Record<EmailRole, DeliveryOutcome>>;
    }

    for (const role of roles) {
      // La clienta sin correo no tiene a quién reenviarle: no cuenta como fallo.
      if (role === "customer" && !order.email) continue;
      const outcome = outcomes?.[role];
      if (outcome?.ok) {
        summary.sent.push({ orderId, kind: row.kind, role });
        continue;
      }
      const error = outcome && !outcome.ok ? outcome.error : "sin resultado del envío";
      summary.failed.push({ orderId, kind: row.kind, role, error });
      await db.failedNotification.create({
        data: { storeId: row.storeId, channel: "EMAIL", kind: row.kind, recipient: role, orderId, error: `reintento: ${error}`.slice(0, 2_000) },
      });
    }
  }
  return summary;
}
