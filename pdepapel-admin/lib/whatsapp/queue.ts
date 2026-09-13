import { Client, Receiver } from "@upstash/qstash";

/**
 * Cola durable de WhatsApp: el webhook guarda el evento y lo encola aquí; el
 * procesador firmado lo convierte en conversación. Mismo esquema que Mercado
 * Libre (QStash + Receiver), pero independiente: los dos proveedores no se
 * importan entre sí.
 */

type QueueEnvironment = Record<string, string | undefined>;

const REQUIRED_QUEUE_VARIABLES = [
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "ADMIN_WEB_URL",
] as const;

export const WHATSAPP_PROCESSOR_PATH = "/api/internal/marketplaces/whatsapp/process";

export function getWhatsAppQueueConfigurationStatus(
  environment: QueueEnvironment = process.env,
) {
  const missing = REQUIRED_QUEUE_VARIABLES.filter(
    (key) => !environment[key]?.trim(),
  );
  return { configured: missing.length === 0, missing };
}

export function getWhatsAppProcessorUrl(
  environment: QueueEnvironment = process.env,
) {
  const adminUrl = environment.ADMIN_WEB_URL;
  if (!adminUrl) {
    throw new Error("ADMIN_WEB_URL es requerida para procesar WhatsApp");
  }
  return new URL(WHATSAPP_PROCESSOR_PATH, adminUrl).toString();
}

/**
 * Los eventos de una misma clienta se procesan de a uno y en orden: la llave
 * de flujo es su teléfono normalizado (o `unknown` cuando el cuerpo no trae
 * ninguno, por ejemplo un cambio de plantilla).
 */
export function getWhatsAppFlowControlKey(phone: string | null | undefined) {
  return `whatsapp-conversation-${phone?.trim() || "unknown"}`;
}

/** Devuelve `false` sin lanzar cuando la cola no está configurada. */
export async function enqueueWhatsAppWebhookEvent(
  eventId: string,
  phone: string | null | undefined,
  environment: QueueEnvironment = process.env,
) {
  if (!getWhatsAppQueueConfigurationStatus(environment).configured) {
    return false;
  }

  const client = new Client({
    token: environment.QSTASH_TOKEN,
    enableTelemetry: false,
  });
  await client.publishJSON({
    url: getWhatsAppProcessorUrl(environment),
    body: { eventId },
    retries: 5,
    timeout: 50,
    flowControl: {
      key: getWhatsAppFlowControlKey(phone),
      parallelism: 1,
    },
    label: ["whatsapp", "webhook"],
    redact: { body: true },
  });

  return true;
}

export async function verifyWhatsAppProcessorRequest(
  body: string,
  signature: string | null,
  requestUrl: string,
  region: string | null,
  environment: QueueEnvironment = process.env,
) {
  const status = getWhatsAppQueueConfigurationStatus(environment);
  if (!status.configured || !signature) return false;

  const receiver = new Receiver({
    currentSigningKey: environment.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: environment.QSTASH_NEXT_SIGNING_KEY,
  });

  return receiver.verify({
    body,
    signature,
    url: requestUrl,
    upstashRegion: region ?? undefined,
  });
}
