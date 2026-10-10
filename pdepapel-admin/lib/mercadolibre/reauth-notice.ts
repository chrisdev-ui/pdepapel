import { deliverEmails } from "@/lib/email-delivery";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import prismadb from "@/lib/prismadb";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";

/** Un solo aviso al panel cuando la conexión pasa a «Requiere reconexión». */
export async function notifyMercadoLibreReauthRequired(connectionId: string) {
  try {
    const connection = await prismadb.marketplaceConnection.findUnique({ where: { id: connectionId }, select: { storeId: true } });
    if (!connection) return;
    const to = await getAdminNotificationRecipients(connection.storeId);
    if (to.length === 0) {
      console.warn("[MERCADOLIBRE] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa la reconexión.");
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
