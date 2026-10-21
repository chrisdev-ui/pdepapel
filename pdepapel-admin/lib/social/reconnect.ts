import { SocialAccountStatus, type SocialPlatform } from "@prisma/client";

import { PanelNotice } from "@/emails/panel-notice";
import { deliverEmails } from "@/lib/email-delivery";
import prismadb from "@/lib/prismadb";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";
export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok" };

/**
 * Pasa la cuenta a «Reconectar» y avisa por correo solo en la transición: una
 * corrida que la encuentra ya en ese estado actualiza el motivo y no escribe.
 * Volver a conectarla la deja en OK, así que la próxima caída avisa otra vez.
 */
export async function markSocialNeedsReconnect(accountId: string, reason: string) {
  const statusReason = reason.slice(0, 191);
  // Una sola sentencia: con relationMode = "prisma", updateMany lee y luego escribe, y dos corridas a la vez avisaban dos veces.
  const flipped = await prismadb.$executeRaw`UPDATE \`SocialAccount\` SET \`status\` = 'NEEDS_RECONNECT', \`statusReason\` = ${statusReason}, \`updatedAt\` = NOW(3) WHERE \`id\` = ${accountId} AND \`status\` <> 'NEEDS_RECONNECT'`;
  if (flipped === 1) {
    await notifySocialReconnectRequired(accountId);
    return true;
  }
  await prismadb.socialAccount.updateMany({ where: { id: accountId }, data: { statusReason } });
  return false;
}

export async function notifySocialReconnectRequired(accountId: string) {
  try {
    const account = await prismadb.socialAccount.findUnique({ where: { id: accountId }, select: { storeId: true, platform: true } });
    if (!account) return;
    const to = await getAdminNotificationRecipients(account.storeId);
    if (to.length === 0) {
      console.warn("[SOCIAL] Sin correos para avisos; no se avisa la reconexión.");
      return;
    }
    const label = SOCIAL_PLATFORM_LABEL[account.platform];
    const link = `${PANEL_ORIGIN}/${account.storeId}/redes`;
    const { resend } = await import("@/lib/resend");
    await deliverEmails(
      [
        {
          role: "admin",
          send: () =>
            resend.emails.send({
              from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
              to,
              subject: `⚠️ Hay que reconectar ${label}`,
              react: PanelNotice({
                preview: `Hay que reconectar ${label}`,
                label: "Panel · Métricas de redes",
                title: `Hay que reconectar ${label}`,
                summary: `${label} rechazó el acceso guardado: las métricas de redes no se actualizan hasta volver a conectar la cuenta.`,
                action: "Entra a Métricas de redes en el panel y usa «Volver a conectar».",
                cta: { href: link, label: "Ir a Métricas de redes" },
              }) as React.ReactElement,
              text: `${label} rechazó el acceso guardado: las métricas de redes no se actualizan hasta volver a conectar la cuenta. Hazlo desde ${link} («Volver a conectar»).`,
            }),
        },
      ],
      { storeId: account.storeId, kind: "social:reconnect" },
    );
  } catch (error) {
    console.error("[SOCIAL] No se pudo avisar la reconexión:", error instanceof Error ? error.message : "unknown");
  }
}

/** Las redes de la tienda que piden reconectar, para el aviso de Inicio. */
export async function getSocialReconnectNeeds(storeId: string) {
  const accounts = await prismadb.socialAccount.findMany({
    where: { storeId, status: SocialAccountStatus.NEEDS_RECONNECT },
    select: { platform: true },
    orderBy: { platform: "asc" },
  });
  return accounts.map((account) => account.platform);
}
