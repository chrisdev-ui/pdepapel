import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook de WhatsApp (Cloud API, vía Chakra). El webhook de Chakra es de
 * paso: reenvía el cuerpo nativo de Meta sin modificarlo, que tiene la forma
 * `{ object, entry: [{ id: WABA_ID, changes: [{ field, value }] }] }`. Aun
 * así, aquí nada se rechaza: lo que llega se guarda tal cual y se clasifica
 * lo mejor posible, para que un cambio de forma no pierda eventos.
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
export function parseWhatsAppWebhookPayload(
  body: string,
): WhatsAppWebhookPayload {
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
    const value =
      firstChange && isRecord(firstChange.value) ? firstChange.value : null;
    const metadata = value && isRecord(value.metadata) ? value.metadata : null;

    const topic =
      (firstChange && asTrimmedString(firstChange.field)) ?? "unknown";
    const resource =
      (metadata && asTrimmedString(metadata.phone_number_id)) ??
      sellerId ??
      "unknown";

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

/** Un BSUID de Meta: `CO.2465629583926901`, `US.13491…`. Prefijo de dos letras. */
const BSUID = /^[A-Z]{2}\.\d{6,}$/;

const asBsuid = (value: unknown): string | null => {
  const raw = asTrimmedString(value);
  return raw && BSUID.test(raw) ? raw : null;
};

export interface WhatsAppContactIdentity {
  /** Teléfono de la clienta, solo dígitos. `null` si el cuerpo no lo trae. */
  phone: string | null;
  /** BSUID de la clienta. Llega con teléfono o sin él. */
  bsuid: string | null;
}

/**
 * Quién es la clienta a la que pertenece el evento.
 *
 * Meta manda el teléfono en `from` (mensaje entrante), en `to` (eco del
 * celular de Paula: ahí los papeles se invierten) o en `recipient_id` (estado
 * de entrega). **Desde que existen los nombres de usuario, puede no mandar
 * ninguno**: a quien tiene uno se le omite el teléfono salvo que haya habido
 * trato en 30 días o esté en la libreta del negocio —y contestarle no basta,
 * comprobado con una conversación de venta de veinte minutos en la que nunca
 * apareció—. Lo que sí llega siempre es el BSUID, en `from_user_id`,
 * `to_user_id` o `contacts[].user_id`.
 *
 * Por eso esto devuelve los dos y no uno: el teléfono cuando esté, el BSUID
 * siempre, y quien llama decide con cuál se queda.
 */
export function getWhatsAppWebhookIdentity(
  payload: WhatsAppWebhookPayload,
): WhatsAppContactIdentity {
  const digits = (value: string | null) =>
    value ? value.replace(/\D/g, "") || null : null;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let phone: string | null = null;
  let bsuid: string | null = null;

  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const {
        messages,
        statuses,
        message_echoes: echoes,
        contacts,
      } = change.value;

      const first = (Array.isArray(messages) ? messages : []).find(isRecord);
      if (first) {
        phone ??= digits(asTrimmedString(first.from));
        bsuid ??= asBsuid(first.from_user_id);
      }

      const firstEcho = (Array.isArray(echoes) ? echoes : []).find(isRecord);
      if (firstEcho) {
        phone ??= digits(asTrimmedString(firstEcho.to));
        bsuid ??= asBsuid(firstEcho.to_user_id);
      }

      const firstStatus = (Array.isArray(statuses) ? statuses : []).find(
        isRecord,
      );
      if (firstStatus) {
        phone ??= digits(asTrimmedString(firstStatus.recipient_id));
        bsuid ??= asBsuid(firstStatus.recipient_user_id);
      }

      // `contacts[]` acompaña a los entrantes y trae el BSUID aunque el
      // mensaje no lo repita.
      const firstContact = (Array.isArray(contacts) ? contacts : []).find(
        isRecord,
      );
      if (firstContact) {
        phone ??= digits(asTrimmedString(firstContact.wa_id));
        bsuid ??= asBsuid(firstContact.user_id);
      }

      if (phone && bsuid) return { phone, bsuid };
    }
  }
  return { phone, bsuid };
}

/**
 * Llave con la que se serializa la cola: una conversación a la vez, para que
 * dos mensajes de la misma persona no se procesen a la vez.
 *
 * Se prefiere el teléfono —es lo que han usado las conversaciones de siempre—
 * y se cae al BSUID. Antes, sin teléfono devolvía `null` y **todos** los
 * contactos con nombre de usuario compartían la misma fila de espera
 * (`…-unknown`), así que sus mensajes se mezclaban entre sí.
 */
export function getWhatsAppWebhookConversationKey(
  payload: WhatsAppWebhookPayload,
): string | null {
  const { phone, bsuid } = getWhatsAppWebhookIdentity(payload);
  return phone ?? bsuid;
}

/**
 * Cuándo escribió Paula, según el eco: el `timestamp` (segundos Unix) más
 * reciente de `message_echoes` en todo el cuerpo, o `null` si no hay ecos o
 * ninguno trae fecha legible.
 *
 * Es la hora del mensaje y no la de ahora a propósito: `lastOwnerAt` mide
 * las 24 h de silencio del bot desde ahí, y un eco que Meta reintente tarde
 * no debe alargarlas.
 */
export function getWhatsAppWebhookOwnerEchoAt(
  payload: WhatsAppWebhookPayload,
): Date | null {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let latest: number | null = null;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const echoes = change.value.message_echoes;
      for (const echo of Array.isArray(echoes) ? echoes : []) {
        if (!isRecord(echo)) continue;
        const seconds = Number(asTrimmedString(echo.timestamp));
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        if (latest === null || seconds > latest) latest = seconds;
      }
    }
  }
  return latest === null ? null : new Date(latest * 1000);
}

/** @deprecated Usa `getWhatsAppWebhookIdentity`: puede no haber teléfono. */
export function getWhatsAppWebhookPhone(
  payload: WhatsAppWebhookPayload,
): string | null {
  return getWhatsAppWebhookIdentity(payload).phone;
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
  const received = signatureHeader
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = createHmac("sha256", appSecret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(received, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}
