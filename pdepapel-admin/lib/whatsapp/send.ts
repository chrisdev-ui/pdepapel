import { env } from "@/lib/env.mjs";

/**
 * Envío de mensajes de WhatsApp a través de Chakra, que hace de BSP.
 *
 * Autenticación directa con `CHAKRA_API_KEY`: no hay intercambio de tokens.
 * Nunca lanza y nunca reintenta: un reintento a ciegas le llegaría dos veces
 * a la clienta. Quien llama decide qué hacer con el fallo.
 */

const CHAKRA_API_BASE = "https://api.chakrahq.com/v1/ext/plugin/whatsapp";

/** Un BSUID de Meta: `CO.2465629583926901`. */
const BSUID_PATTERN = /^[A-Z]{2}\.\d{6,}$/;

/**
 * Dónde va el destinatario en el cuerpo.
 *
 * Meta lo dice sin rodeos: para escribirle a alguien de quien solo se tiene el
 * BSUID, va en `recipient` y **se omite `to`**. Si se conocen los dos, `to`
 * manda —y conviene mandarlo, porque es lo que hace que el teléfono siga
 * llegando en los webhooks—.
 *
 * Esto vale porque el endpoint que usamos es el genérico de mensajes
 * (`/{phoneNumberId}/messages`), que Chakra deja pasar tal cual. El de
 * «plantilla por número de teléfono», que no admite BSUID, no se usa aquí.
 */
export function buildRecipientFields(
  recipient: string | null,
): Record<string, string> {
  const value = recipient?.trim();
  if (!value) return {};
  return BSUID_PATTERN.test(value) ? { recipient: value } : { to: value };
}
const CHAKRA_API_VERSION = "v24.0";

/**
 * WhatsApp corta el cuerpo de un mensaje de texto en 4096 caracteres. Se
 * recorta aquí para que un texto largo no se convierta en un rechazo.
 */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;

/**
 * El cuerpo de un mensaje interactivo es mucho más corto que el de uno de
 * texto: 1024 caracteres, no 4096.
 */
export const WHATSAPP_INTERACTIVE_BODY_MAX_LENGTH = 1024;
/** Meta admite 3 botones de respuesta como máximo, de 20 caracteres cada uno. */
export const WHATSAPP_MAX_BUTTONS = 3;
export const WHATSAPP_BUTTON_TITLE_MAX_LENGTH = 20;

/** Topes de Meta. Diez filas EN TOTAL, no diez por sección. */
export const WHATSAPP_LIST_MAX_ROWS = 10;
export const WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH = 24;
export const WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH = 72;
export const WHATSAPP_LIST_ROW_ID_MAX_LENGTH = 200;
export const WHATSAPP_LIST_SECTION_TITLE_MAX_LENGTH = 24;
export const WHATSAPP_LIST_BUTTON_MAX_LENGTH = 20;
export const WHATSAPP_LIST_FOOTER_MAX_LENGTH = 60;
/** A diferencia de los botones, el cuerpo de una lista admite 4096. */
export const WHATSAPP_LIST_BODY_MAX_LENGTH = 4096;

export interface WhatsAppReplyButton {
  /** Vuelve tal cual en el webhook cuando la tocan. */
  id: string;
  title: string;
}

export interface WhatsAppListRow {
  /** Vuelve tal cual en `list_reply.id` cuando la tocan. */
  id: string;
  title: string;
  description?: string;
}

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
  // Chakra envuelve la respuesta en { _data, _meta, _errors }. Forma confirmada
  // contra la API real (rechazo de Meta el 2026-09-14):
  //   { "_data": [], "_errors": ["(#131009) Parameter value is not valid"] }
  // `_errors` es una lista de textos que ya traen el código de Meta dentro.
  // Las demás rutas se conservan por si alguna vez reenvían el error nativo.
  const root = payload as Record<string, unknown>;
  const errors = root._errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      const { message, code } = first as { message?: unknown; code?: unknown };
      if (typeof message === "string" && message.trim()) {
        return code === undefined || code === null
          ? message.trim()
          : `${message.trim()} (${String(code)})`;
      }
    }
  } else if (errors && typeof errors === "object") {
    const { message, code } = errors as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message.trim()) {
      return code === undefined || code === null
        ? message.trim()
        : `${message.trim()} (${String(code)})`;
    }
  }

  // Por si Chakra reenvía el error nativo de Meta, sin envolver o dentro de `_data`.
  const nativeError = (root.error ??
    (root._data as Record<string, unknown> | undefined)?.error) as
    | { message?: unknown; code?: unknown }
    | undefined;
  if (nativeError && typeof nativeError === "object") {
    const { message, code } = nativeError;
    const text =
      typeof message === "string" && message.trim() ? message.trim() : null;
    if (text)
      return code === undefined || code === null
        ? text
        : `${text} (${String(code)})`;
  }

  return null;
}

function readTraceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const candidates = [
    (root.error as { fbtrace_id?: unknown } | undefined)?.fbtrace_id,
    (
      (root._data as Record<string, unknown> | undefined)?.error as
        | { fbtrace_id?: unknown }
        | undefined
    )?.fbtrace_id,
    Array.isArray(root._errors)
      ? (root._errors[0] as { fbtrace_id?: unknown } | undefined)?.fbtrace_id
      : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
}

function readRequestId(response: Response, payload: unknown): string | null {
  // No se ha confirmado con Chakra qué cabecera (si alguna) usan para dar
  // seguimiento a una petición, a diferencia de `x-dualhook-request-id`.
  // Se prueban las variantes más comunes; si ninguna aparece, queda null y
  // el primer fallo real en producción dirá cuál usar.
  const headerCandidates = [
    "x-chakra-request-id",
    "x-request-id",
    "x-amzn-requestid",
  ];
  for (const name of headerCandidates) {
    const value = response.headers?.get?.(name);
    if (value) return value;
  }
  if (payload && typeof payload === "object") {
    const meta = (payload as Record<string, unknown>)._meta;
    if (meta && typeof meta === "object") {
      const requestId = (meta as Record<string, unknown>).requestId;
      if (typeof requestId === "string" && requestId.trim())
        return requestId.trim();
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
 * Envía un payload ya armado. Sin credenciales configuradas no hace la
 * petición y responde `not configured`, para que el archivo de la conversación
 * nunca dependa de que el envío esté listo.
 */
async function postToChakra(
  /** Teléfono de siempre, o BSUID cuando la clienta tiene nombre de usuario. */
  to: string | null,
  // `payload` a secas está tomado más abajo por el cuerpo de la RESPUESTA,
  // que es lo que leen readError/readTraceId/readExternalId.
  messagePayload: Record<string, unknown>,
  environment: SendEnvironment,
  /**
   * Un mensaje devuelve wamid y sin él algo salió mal. El indicador de
   * escritura no es un mensaje: responde 200 con `_data` vacío, así que
   * exigirle un wamid lo daría por fallido.
   */
  expectMessageId = true,
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
          // `recipient_type` se omite a propósito: es opcional y su valor por
          // defecto ya es "individual". Así el mensaje de texto sale byte a
          // byte como el que lleva meses funcionando en producción.
          ...buildRecipientFields(to),
          ...messagePayload,
        }),
      },
    );

    const payload = await response.json().catch(() => null);
    const externalId = readExternalId(payload);

    if (response.ok && externalId) return { ok: true, externalId };
    if (response.ok && !expectMessageId) return { ok: true, externalId: "" };

    const requestId = readRequestId(response, payload);
    const fbTraceId = readTraceId(payload);
    const error = readError(payload) ?? `HTTP ${response.status}`;
    // Sin el payload crudo: ya se confirmó la forma de `_errors` y volcarlo
    // entero arrastraba el mensaje de la clienta a los logs de Vercel.
    console.error("[WHATSAPP_SEND] El envío fue rechazado", {
      status: response.status,
      error,
      requestId,
      fbTraceId,
    });
    return { ok: false, error, requestId, fbTraceId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("[WHATSAPP_SEND] No se pudo contactar a Chakra", { message });
    return { ok: false, error: message.slice(0, 500) };
  }
}

/** Mensaje de texto normal. */
export async function sendWhatsAppTextMessage(
  to: string,
  body: string,
  environment: SendEnvironment = env,
): Promise<WhatsAppSendResult> {
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }
  return postToChakra(
    to,
    { type: "text", text: { body: body.slice(0, WHATSAPP_TEXT_MAX_LENGTH) } },
    environment,
  );
}

/**
 * Mensaje con botones de respuesta.
 *
 * Confirmado contra la API el 2026-09-14: Chakra reenvía `type: "interactive"`
 * a Meta sin tocarlo, y un payload inválido vuelve con el error real de Meta.
 *
 * Los topes de Meta se aplican aquí (3 botones, 20 caracteres por botón, 1024
 * de cuerpo) porque pasarse significa un rechazo entero, no un recorte.
 */
export async function sendWhatsAppButtonMessage(
  to: string,
  body: string,
  buttons: WhatsAppReplyButton[],
  environment: SendEnvironment = env,
): Promise<WhatsAppSendResult> {
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }

  const usable = buttons
    .filter((button) => button.id.trim() && button.title.trim())
    .slice(0, WHATSAPP_MAX_BUTTONS);
  if (usable.length === 0) {
    return { ok: false, error: "sin botones que mandar" };
  }

  return postToChakra(
    to,
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, WHATSAPP_INTERACTIVE_BODY_MAX_LENGTH) },
        action: {
          buttons: usable.map((button) => ({
            type: "reply",
            reply: {
              id: button.id.trim(),
              title: button.title
                .trim()
                .slice(0, WHATSAPP_BUTTON_TITLE_MAX_LENGTH),
            },
          })),
        },
      },
    },
    environment,
  );
}

/**
 * Lo mismo, pero con una foto encima del texto.
 *
 * Confirmado contra la API el 2026-09-15: Chakra reenvía la cabecera de imagen
 * a Meta sin tocarla, y Meta valida la forma en el momento —una cabecera con
 * un `type` inventado vuelve con un 400 nombrando `interactive.header.type`, y
 * una imagen sin `link` con `(#131009)`—, así que un 200 con wamid significa
 * que la forma es buena. Christian lo vio en su teléfono: foto, texto y botón.
 *
 * Se usa `link` y no un `id` de Meta: las fotos ya están públicas en Cloudinary
 * y así no hay que subirlas antes. La URL tiene que ser JPEG o PNG —Meta no
 * acepta webp ni avif— y de eso se encarga la transformación de siempre, que
 * devuelve JPEG a quien no pide otra cosa.
 *
 * Va con `interactive` y no con `type: "image"` a secas porque un mensaje de
 * imagen suelto NO admite botones, y todo lo que manda el bot lleva el de
 * «Hablar con Paula».
 */
export async function sendWhatsAppImageButtonMessage(
  to: string,
  body: string,
  buttons: WhatsAppReplyButton[],
  imageUrl: string,
  environment: SendEnvironment = env,
): Promise<WhatsAppSendResult> {
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }
  if (!imageUrl.trim()) return { ok: false, error: "sin foto que mandar" };

  const usable = buttons
    .filter((button) => button.id.trim() && button.title.trim())
    .slice(0, WHATSAPP_MAX_BUTTONS);
  if (usable.length === 0) {
    return { ok: false, error: "sin botones que mandar" };
  }

  return postToChakra(
    to,
    {
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "image", image: { link: imageUrl.trim() } },
        body: { text: body.slice(0, WHATSAPP_INTERACTIVE_BODY_MAX_LENGTH) },
        action: {
          buttons: usable.map((button) => ({
            type: "reply",
            reply: {
              id: button.id.trim(),
              title: button.title
                .trim()
                .slice(0, WHATSAPP_BUTTON_TITLE_MAX_LENGTH),
            },
          })),
        },
      },
    },
    environment,
  );
}

/**
 * Muestra «escribiendo…» en el teléfono de la clienta y marca su mensaje como
 * leído (doble check azul), en una sola llamada.
 *
 * Confirmado contra la API el 2026-09-14: Chakra lo reenvía a Meta y responde
 * 200 con `_data` vacío, porque esto no es un mensaje y no genera wamid.
 *
 * Meta lo mantiene 25 segundos como máximo, o hasta que se mande la respuesta,
 * lo que ocurra primero. Nunca lanza: si falla, la respuesta igual sale.
 */
/**
 * La lista tocable. No admite foto de cabecera ni botones de respuesta, así
 * que la salida hacia Paula viaja como una fila más. Los topes se aplican
 * aquí: pasarse de uno solo es un rechazo entero, no un recorte.
 */
export async function sendWhatsAppListMessage(
  to: string,
  body: string,
  list: {
    /** Lo que se lee en el botón que abre la lista. */
    button: string;
    /** Encabezado de la sección, dentro de la lista ya abierta. */
    section: string;
    rows: WhatsAppListRow[];
    footer?: string;
  },
  environment: SendEnvironment = env,
): Promise<WhatsAppSendResult> {
  if (!to.trim() || !body.trim()) {
    return { ok: false, error: "destinatario o mensaje vacío" };
  }

  const rows = list.rows
    .filter((row) => row.id.trim() && row.title.trim())
    .slice(0, WHATSAPP_LIST_MAX_ROWS)
    .map((row) => ({
      id: row.id.trim().slice(0, WHATSAPP_LIST_ROW_ID_MAX_LENGTH),
      title: row.title.trim().slice(0, WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH),
      ...(row.description?.trim()
        ? {
            description: row.description
              .trim()
              .slice(0, WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH),
          }
        : {}),
    }));
  if (rows.length === 0) return { ok: false, error: "sin opciones que mandar" };

  const button = list.button.trim().slice(0, WHATSAPP_LIST_BUTTON_MAX_LENGTH);
  if (!button)
    return { ok: false, error: "sin texto para el botón de la lista" };

  const footer = list.footer?.trim().slice(0, WHATSAPP_LIST_FOOTER_MAX_LENGTH);

  return postToChakra(
    to,
    {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body.slice(0, WHATSAPP_LIST_BODY_MAX_LENGTH) },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          button,
          sections: [
            {
              title: list.section
                .trim()
                .slice(0, WHATSAPP_LIST_SECTION_TITLE_MAX_LENGTH),
              rows,
            },
          ],
        },
      },
    },
    environment,
  );
}

export async function sendWhatsAppTypingIndicator(
  inboundMessageId: string,
  environment: SendEnvironment = env,
): Promise<{ ok: boolean; error?: string }> {
  if (!inboundMessageId.trim())
    return { ok: false, error: "sin mensaje al que responder" };

  const result = await postToChakra(
    // El destinatario va implícito en `message_id`; mandar `to` sobra.
    null,
    {
      status: "read",
      message_id: inboundMessageId.trim(),
      typing_indicator: { type: "text" },
    },
    environment,
    false,
  );

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
