import { Redis } from "@upstash/redis";

import { deliverEmails, type ResendSendResult } from "@/lib/email-delivery";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { PanelNotice } from "@/emails/panel-notice";

const ALERT_KEY = "monitor:db-health:container-alert";
const ALERT_COOLDOWN_SECONDS = 20 * 3600;
const PANEL_URL = "https://admin.papeleriapdepapel.com";

type AlertRedis = { set: (key: string, value: string, options: { nx: true; ex: number }) => Promise<unknown> };
type Send = (email: { from: string; to: string[]; subject: string; text: string; react?: React.ReactElement }) => Promise<ResendSendResult>;

/** Correo de la revisión diaria cuando el contenedor de MySQL crece de más; uno por día como mucho. */
export async function sendDbHealthAlert(
  warnings: string[],
  detail: string,
  deps: { redis?: AlertRedis; send?: Send; recipients?: () => Promise<string[]> } = {},
): Promise<"sent" | "cooldown" | "failed"> {
  try {
    const claimed = await (deps.redis ?? Redis.fromEnv()).set(ALERT_KEY, "1", { nx: true, ex: ALERT_COOLDOWN_SECONDS });
    if (claimed !== "OK") return "cooldown";
  } catch (error) {
    console.error("[DB_HEALTH] No se pudo revisar la pausa del aviso; se manda igual:", error);
  }

  const to = await (deps.recipients ?? (() => getAdminNotificationRecipients()))();
  if (to.length === 0) {
    console.warn("[DB_HEALTH] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa.");
    return "failed";
  }
  const send: Send =
    deps.send ??
    (async (email) => {
      const { resend } = await import("@/lib/resend");
      return resend.emails.send(email) as Promise<ResendSendResult>;
    });
  const outcomes = await deliverEmails(
    [
      {
        role: "admin",
        send: () =>
          send({
            from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
            to,
            subject: "⚠️ Memoria de MySQL alta",
            react: PanelNotice({
              preview: "La memoria de MySQL está alta",
              label: "Panel · Sistemas",
              title: "Memoria de MySQL alta",
              summary: warnings.join(" "),
              sections: [{ label: "Detalle", lines: detail.split("\n").filter(Boolean) }],
              action: "Revisa la memoria del servicio «MySQL US East» en Railway. El detalle queda en «Sistemas», en Inicio del panel.",
              cta: { href: PANEL_URL, label: "Abrir el panel" },
              note: "Este aviso sale como mucho una vez al día.",
            }) as React.ReactElement,
            text: `${warnings.join("\n")}\n\n${detail}\n\nRevisa la memoria del servicio «MySQL US East» en Railway. El detalle queda en «Sistemas», en Inicio del panel (${PANEL_URL}).`,
          }),
      },
    ],
    { kind: "db-health" },
  );
  return outcomes.admin?.ok ? "sent" : "failed";
}
