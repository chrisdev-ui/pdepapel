import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook de WhatsApp (Cloud API, vía Dualhook). Todavía no se sabe con
 * certeza si Dualhook reenvía el cuerpo nativo de Meta o uno propio, así que
 * aquí nada se rechaza: lo que llega se guarda tal cual y se clasifica lo
 * mejor posible. La forma nativa de Meta es
 * `{ object, entry: [{ id: WABA_ID, changes: [{ field, value }] }] }`.
 */

export type WhatsAppWebhookPayload = Record<string, unknown>;

export interface WhatsAppWebhookClassification {
  /** `field` del cambio (`messages`, `message_template_status_update`, …) o `unknown`. */
  topic: string;
  /** `phone_number_id` del número que recibió el evento, o el WABA, o `unknown`. */
  resource: string;
  /** Id de la cuenta de WhatsApp Business (WABA); `null` si el cuerpo no lo trae. */
  sellerId: string | null;
  /** Llave de deduplicación: id del mensaje o del estado, o el hash del cuerpo. */
  eventKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Serialización con llaves ordenadas: el mismo cuerpo siempre da el mismo hash. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashWhatsAppWebhookPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/**
 * Nunca lanza: un cuerpo que no es JSON (o que es un JSON que no es objeto)
 * se envuelve para guardarlo igual.
 */
export function parseWhatsAppWebhookPayload(body: string): WhatsAppWebhookPayload {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed)) return parsed;
    return { _rawUnparsable: body };
  } catch {
    return { _rawUnparsable: body };
  }
}

/**
 * Extrae tema, recurso, WABA y llave de deduplicación de un cuerpo con la
 * forma nativa de Meta. Un cuerpo con varios mensajes o estados se deduplica
 * por el hash completo para no perder los que no van primero. Con cualquier
 * otra forma cae a `unknown` y al hash. Nunca lanza.
 */
export function classifyWhatsAppWebhookEvent(
  payload: WhatsAppWebhookPayload,
): WhatsAppWebhookClassification {
  const fallback: WhatsAppWebhookClassification = {
    topic: "unknown",
    resource: "unknown",
    sellerId: null,
    eventKey: hashWhatsAppWebhookPayload(payload),
  };

  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const firstEntry = entries.find(isRecord);
    if (!firstEntry) return fallback;

    const sellerId = asTrimmedString(firstEntry.id);
    const changes = Array.isArray(firstEntry.changes) ? firstEntry.changes : [];
    const firstChange = changes.find(isRecord);
    const value = firstChange && isRecord(firstChange.value) ? firstChange.value : null;
    const metadata = value && isRecord(value.metadata) ? value.metadata : null;

    const topic = (firstChange && asTrimmedString(firstChange.field)) ?? "unknown";
    const resource =
      (metadata && asTrimmedString(metadata.phone_number_id)) ?? sellerId ?? "unknown";

    const ids: string[] = [];
    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (!isRecord(change) || !isRecord(change.value)) continue;
        for (const list of [change.value.messages, change.value.statuses]) {
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            const id = isRecord(item) ? asTrimmedString(item.id) : null;
            if (id) ids.push(id);
          }
        }
      }
    }

    return {
      topic,
      resource,
      sellerId,
      eventKey: ids.length === 1 ? ids[0] : hashWhatsAppWebhookPayload(payload),
    };
  } catch {
    return fallback;
  }
}

/**
 * Firma de Meta: `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del cuerpo
 * crudo con el secreto de la app. Sin secreto configurado nunca valida.
 */
export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const received = signatureHeader.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = createHmac("sha256", appSecret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}
