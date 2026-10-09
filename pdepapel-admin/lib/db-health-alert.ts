import { Redis } from "@upstash/redis";

import { ADMIN_EMAIL_RECIPIENTS, deliverEmails, type ResendSendResult } from "@/lib/email-delivery";

const ALERT_KEY = "monitor:db-health:container-alert";
const ALERT_COOLDOWN_SECONDS = 20 * 3600;
const PANEL_URL = "https://admin.papeleriapdepapel.com";

type AlertRedis = { set: (key: string, value: string, options: { nx: true; ex: number }) => Promise<unknown> };
type Send = (email: { from: string; to: string[]; subject: string; text: string }) => Promise<ResendSendResult>;

/** Correo de la revisión diaria cuando el contenedor de MySQL crece de más; uno por día como mucho. */
export async function sendDbHealthAlert(
  warnings: string[],
  detail: string,
  deps: { redis?: AlertRedis; send?: Send } = {},
): Promise<"sent" | "cooldown" | "failed"> {
  try {
    const claimed = await (deps.redis ?? Redis.fromEnv()).set(ALERT_KEY, "1", { nx: true, ex: ALERT_COOLDOWN_SECONDS });
    if (claimed !== "OK") return "cooldown";
  } catch (error) {
    console.error("[DB_HEALTH] No se pudo revisar la pausa del aviso; se manda igual:", error);
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
            to: ADMIN_EMAIL_RECIPIENTS,
            subject: "⚠️ Memoria de MySQL alta",
            text: `${warnings.join("\n")}\n\n${detail}\n\nRevisa la memoria del servicio «MySQL US East» en Railway. El detalle queda en «Sistemas», en Inicio del panel (${PANEL_URL}).`,
          }),
      },
    ],
    { kind: "db-health" },
  );
  return outcomes.admin?.ok ? "sent" : "failed";
}
