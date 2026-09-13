import { env } from "@/lib/env.mjs";

/**
 * Envío de mensajes de WhatsApp a través de Dualhook, que hace de BSP.
 *
 * Autenticación directa con `DUALHOOK_API_KEY`: no hay intercambio de tokens.
 * Nunca lanza y nunca reintenta: Dualhook no reintenta una mutación de mensaje,
 * y un reintento a ciegas le llegaría dos veces a la clienta. Quien llama
 * decide qué hacer con el fallo.
 */

const DUALHOOK_API_BASE = "https://api.dualhook.com/v25.0";

/**
 * WhatsApp corta el cuerpo de un mensaje de texto en 4096 caracteres, muy por
 * debajo del tope de 64 KiB que Dualhook le pone al JSON completo. Se recorta
 * aquí para que un texto largo no se convierta en un rechazo.
 */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;

export type WhatsAppSendResult =
  | { ok: true; externalId: string }
  | { ok: false; error: string };

type SendEnvironment = {
  DUALHOOK_API_KEY?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
};

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  // Las dos formas de fallo traen `message`: la de Dualhook (rechaza antes de
  // reenviar) y la de Meta (rechaza después), que además trae un código.
  const { message, code } = error as { message?: unknown; code?: unknown };
  const text = typeof message === "string" && message.trim() ? message.trim() : "Error desconocido";
  return code === undefined || code === null ? text : `${text} (${String(code)})`;
}

function readExternalId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const first = messages[0];
  if (!first || typeof first !== "object") return null;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
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
  const apiKey = environment.DUALHOOK_API_KEY?.trim();
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!apiKey || !phoneNumberId) {
    console.warn("[WHATSAPP_SEND] Falta DUALHOOK_API_KEY o WHATSAPP_PHONE_NUMBER_ID; no se envía nada");
    return { ok: false, error: "not configured" };
  }
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }

  try {
    const response = await fetch(`${DUALHOOK_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
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
    });

    const payload = await response.json().catch(() => null);
    const externalId = readExternalId(payload);

    if (response.ok && externalId) return { ok: true, externalId };

    const error = readError(payload) ?? `HTTP ${response.status}`;
    console.error("[WHATSAPP_SEND] El envío fue rechazado", { status: response.status, error });
    return { ok: false, error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[WHATSAPP_SEND] No se pudo contactar a Dualhook", { message });
    return { ok: false, error: message.slice(0, 500) };
  }
}
