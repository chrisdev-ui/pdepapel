import { Redis } from "@upstash/redis";

import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";

const ALERT_KEY = "monitor:storefront-revalidation:alert";
const ALERT_COOLDOWN_SECONDS = 60 * 60;
const RECIPIENTS = [
  "web.christian.dev@gmail.com",
  "papeleria.pdepapel@gmail.com",
];

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
      to: RECIPIENTS,
      subject: "[Alerta] Falló la actualización de la tienda en línea",
      text: `La revalidación de la tienda en línea falló el ${now}.\nOrigen del aviso: una actualización del catálogo solicitó refrescar la tienda en línea.\n\nEndpoints:\n${endpointList}\n\nDetalles:\n${detailList}\n\nLa alerta se limita a una por hora. Revisa los registros de Vercel para identificar y resolver la causa.`,
    });
  } catch (error) {
    console.error("Unable to send revalidation failure alert:", error);
  }
}
