import { env } from "@/lib/env.mjs";

/**
 * Envío de mensajes de WhatsApp a través de Chakra, que hace de BSP.
 *
 * Autenticación directa con `CHAKRA_API_KEY`: no hay intercambio de tokens.
 * Nunca lanza y nunca reintenta: un reintento a ciegas le llegaría dos veces
 * a la clienta. Quien llama decide qué hacer con el fallo.
 */

const CHAKRA_API_BASE = "https://api.chakrahq.com/v1/ext/plugin/whatsapp";
const CHAKRA_API_VERSION = "v24.0";

/**
 * WhatsApp corta el cuerpo de un mensaje de texto en 4096 caracteres. Se
 * recorta aquí para que un texto largo no se convierta en un rechazo.
 */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;

export type WhatsAppSendResult =
  | { ok: true; externalId: string }
  | {
      ok: false;
      error: string;
      /** Cabecera de rastreo de Chakra, si la trae la respuesta. Forma sin confirmar todavía. */
      requestId?: string | null;
      /** `fbtrace_id` de Meta, cuando el rechazo viene de su lado. */
      fbTraceId?: string | null;
    };

type SendEnvironment = {
  CHAKRA_API_KEY?: string;
  CHAKRA_PLUGIN_ID?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
};

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  // Chakra envuelve la respuesta en { _data, _meta, _errors }. La forma exacta
  // de `_errors` en un rechazo real todavía no está confirmada (su docs no
  // traen un ejemplo con error de WhatsApp), así que se prueban varias rutas
  // plausibles antes de rendirse al status HTTP.
  const root = payload as Record<string, unknown>;
  const errors = root._errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      const { message, code } = first as { message?: unknown; code?: unknown };
      if (typeof message === "string" && message.trim()) {
        return code === undefined || code === null ? message.trim() : `${message.trim()} (${String(code)})`;
      }
    }
  } else if (errors && typeof errors === "object") {
    const { message, code } = errors as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message.trim()) {
      return code === undefined || code === null ? message.trim() : `${message.trim()} (${String(code)})`;
    }
  }

  // Por si Chakra reenvía el error nativo de Meta, sin envolver o dentro de `_data`.
  const nativeError = (root.error ?? (root._data as Record<string, unknown> | undefined)?.error) as
    | { message?: unknown; code?: unknown }
    | undefined;
  if (nativeError && typeof nativeError === "object") {
    const { message, code } = nativeError;
    const text = typeof message === "string" && message.trim() ? message.trim() : null;
    if (text) return code === undefined || code === null ? text : `${text} (${String(code)})`;
  }

  return null;
}

function readTraceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const candidates = [
    (root.error as { fbtrace_id?: unknown } | undefined)?.fbtrace_id,
    ((root._data as Record<string, unknown> | undefined)?.error as { fbtrace_id?: unknown } | undefined)
      ?.fbtrace_id,
    Array.isArray(root._errors)
      ? (root._errors[0] as { fbtrace_id?: unknown } | undefined)?.fbtrace_id
      : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function readRequestId(response: Response, payload: unknown): string | null {
  // No se ha confirmado con Chakra qué cabecera (si alguna) usan para dar
  // seguimiento a una petición, a diferencia de `x-dualhook-request-id`.
  // Se prueban las variantes más comunes; si ninguna aparece, queda null y
  // el primer fallo real en producción dirá cuál usar.
  const headerCandidates = ["x-chakra-request-id", "x-request-id", "x-amzn-requestid"];
  for (const name of headerCandidates) {
    const value = response.headers?.get?.(name);
    if (value) return value;
  }
  if (payload && typeof payload === "object") {
    const meta = (payload as Record<string, unknown>)._meta;
    if (meta && typeof meta === "object") {
      const requestId = (meta as Record<string, unknown>).requestId;
      if (typeof requestId === "string" && requestId.trim()) return requestId.trim();
    }
  }
  return null;
}

function readExternalId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  // Forma documentada de Chakra: { _data: { whatsappMessageId } }.
  const data = root._data;
  if (data && typeof data === "object") {
    const id = (data as Record<string, unknown>).whatsappMessageId;
    if (typeof id === "string" && id.trim()) return id.trim();
  }

  // Por si alguna vez pasa el cuerpo nativo de Meta sin envolver.
  const messages = root.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const first = messages[0];
    if (first && typeof first === "object") {
      const id = (first as Record<string, unknown>).id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  }

  return null;
}

/**
 * Manda un mensaje de texto. Sin credenciales configuradas no hace la petición
 * y responde `not configured`, para que el archivo de la conversación nunca
 * dependa de que el envío esté listo.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  body: string,
  environment: SendEnvironment = env,
): Promise<WhatsAppSendResult> {
  const apiKey = environment.CHAKRA_API_KEY?.trim();
  const pluginId = environment.CHAKRA_PLUGIN_ID?.trim();
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!apiKey || !pluginId || !phoneNumberId) {
    console.warn(
      "[WHATSAPP_SEND] Falta CHAKRA_API_KEY, CHAKRA_PLUGIN_ID o WHATSAPP_PHONE_NUMBER_ID; no se envía nada",
    );
    return { ok: false, error: "not configured" };
  }
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }

  try {
    const response = await fetch(
      `${CHAKRA_API_BASE}/${encodeURIComponent(pluginId)}/api/${CHAKRA_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.trim(),
          type: "text",
          text: { body: body.slice(0, WHATSAPP_TEXT_MAX_LENGTH) },
        }),
      },
    );

    const payload = await response.json().catch(() => null);
    const externalId = readExternalId(payload);

    if (response.ok && externalId) return { ok: true, externalId };

    const requestId = readRequestId(response, payload);
    const fbTraceId = readTraceId(payload);
    const error = readError(payload) ?? `HTTP ${response.status}`;
    console.error("[WHATSAPP_SEND] El envío fue rechazado", {
      status: response.status,
      error,
      requestId,
      fbTraceId,
      // Payload crudo temporal: quitar este campo del log una vez que el
      // primer rechazo real confirme la forma exacta de `_errors` de Chakra.
      rawPayload: payload,
    });
    return { ok: false, error, requestId, fbTraceId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[WHATSAPP_SEND] No se pudo contactar a Chakra", { message });
    return { ok: false, error: message.slice(0, 500) };
  }
}
