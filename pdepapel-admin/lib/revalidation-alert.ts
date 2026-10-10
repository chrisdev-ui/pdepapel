import { Redis } from "@upstash/redis";

import { RevalidationAlert } from "@/emails/revalidation-alert";
import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";

const ALERT_KEY = "monitor:storefront-revalidation:alert";
const ALERT_COOLDOWN_SECONDS = 60 * 60;

interface RevalidationFailureAlert {
  endpoints: string[];
  details: string[];
}

export async function sendRevalidationFailureAlert({
  endpoints,
  details,
}: RevalidationFailureAlert): Promise<void> {
  if (env.NODE_ENV !== "production") return;

  try {
    const redis = Redis.fromEnv();
    const cooldownResult = await redis.set(ALERT_KEY, "1", {
      ex: ALERT_COOLDOWN_SECONDS,
      nx: true,
    });

    if (cooldownResult !== "OK") return;
    const to = await getAdminNotificationRecipients();
    if (to.length === 0) {
      console.warn("[REVALIDATION_ALERT] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa.");
      return;
    }

    const now = new Intl.DateTimeFormat("es-CO", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date());
    const endpointList = endpoints
      .map((endpoint) => `• ${endpoint}`)
      .join("\n");
    const detailList = details.map((detail) => `• ${detail}`).join("\n");

    await resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to,
      subject: "[Alerta] Falló la actualización de la tienda en línea",
      react: RevalidationAlert({
        generatedAt: now,
        endpoints,
        details,
      }) as React.ReactElement,
      // El cuerpo en texto plano se conserva: era lo único que había antes y
      // sigue siendo lo que ve quien lee el correo sin HTML.
      text: `La revalidación de la tienda en línea falló el ${now}.\nOrigen del aviso: una actualización del catálogo solicitó refrescar la tienda en línea.\n\nEndpoints:\n${endpointList}\n\nDetalles:\n${detailList}\n\nLa alerta se limita a una por hora. Revisa los registros de Vercel para identificar y resolver la causa.`,
    });
  } catch (error) {
    console.error("Unable to send revalidation failure alert:", error);
  }
}
