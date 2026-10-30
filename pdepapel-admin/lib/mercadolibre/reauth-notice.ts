import { deliverEmails } from "@/lib/email-delivery";
import { getMercadoLibreAlertRecipients } from "@/lib/store-email-settings";
import prismadb from "@/lib/prismadb";
import { PanelNotice } from "@/emails/panel-notice";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";

/** Un solo aviso al panel cuando la conexión pasa a «Requiere reconexión». */
export async function notifyMercadoLibreReauthRequired(connectionId: string) {
  try {
    const connection = await prismadb.marketplaceConnection.findUnique({ where: { id: connectionId }, select: { storeId: true } });
    if (!connection) return;
    const to = await getMercadoLibreAlertRecipients(connection.storeId);
    if (to.length === 0) {
      console.warn("[MERCADOLIBRE] Sin destinatario de alertas de Mercado Libre en Configuración; la reconexión solo se ve en el panel.");
      return;
    }
    const link = `${PANEL_ORIGIN}/${connection.storeId}/mercadolibre`;
    const { resend } = await import("@/lib/resend");
    await deliverEmails(
      [
        {
          role: "admin",
          send: () =>
            resend.emails.send({
              from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
              to,
              subject: "⚠️ Mercado Libre requiere reconexión",
              react: PanelNotice({
                preview: "Mercado Libre requiere reconexión",
                label: "Panel · Mercado Libre",
                title: "Reconecta Mercado Libre",
                summary: "La conexión con Mercado Libre se venció: las publicaciones, el stock y las ventas no se sincronizan hasta reconectarla.",
                action: "Entra a Mercado Libre en el panel y usa «Reconectar» en el Resumen.",
                cta: { href: link, label: "Reconectar Mercado Libre" },
              }) as React.ReactElement,
              text: `La conexión con Mercado Libre se venció: las publicaciones, el stock y las ventas no se sincronizan hasta reconectarla. Reconéctala desde ${link} (Resumen → Reconectar).`,
            }),
        },
      ],
      { storeId: connection.storeId, kind: "mercadolibre:reauth" },
    );
  } catch (error) {
    console.error("[MERCADOLIBRE] No se pudo avisar la reconexión:", error);
  }
}
