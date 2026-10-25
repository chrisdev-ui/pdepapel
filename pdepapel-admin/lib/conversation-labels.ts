import {
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";

/**
 * Etiquetas en español de las conversaciones de WhatsApp. Sin nada de
 * servidor: las usa el hilo en el navegador (`lib/conversations.ts` las
 * reexporta para el servidor).
 */

/** Lo que ve Paula cuando un envío del bot no le llegó a la clienta. */
export const DELIVERY_FAILED_LABEL = "El aviso no le llegó a la clienta";

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  [ConversationStatus.OPEN]: "Abierta",
  [ConversationStatus.NEEDS_OWNER]: "Necesita respuesta",
  [ConversationStatus.RESOLVED]: "Resuelta",
};

export const CONVERSATION_SENT_BY_LABELS: Record<ConversationMessageSentBy, string> = {
  [ConversationMessageSentBy.CUSTOMER]: "Clienta",
  [ConversationMessageSentBy.OWNER]: "Tú",
  [ConversationMessageSentBy.BOT]: "Respuesta automática",
};

export const CONVERSATION_MESSAGE_STATUS_LABELS: Record<ConversationMessageStatus, string> = {
  [ConversationMessageStatus.RECEIVED]: "Recibido",
  [ConversationMessageStatus.QUEUED]: "En cola",
  [ConversationMessageStatus.SENT]: "Enviado",
  [ConversationMessageStatus.DELIVERED]: "Entregado",
  [ConversationMessageStatus.READ]: "Leído",
  [ConversationMessageStatus.FAILED]: "Falló",
};

/** Tipos de adjunto que manda WhatsApp, en palabras de la dueña. */
export const CONVERSATION_MEDIA_LABELS: Record<string, string> = {
  image: "Foto",
  video: "Video",
  audio: "Nota de voz",
  document: "Documento",
  sticker: "Sticker",
  reaction: "Reacción",
  location: "Ubicación",
  contacts: "Contacto",
  order: "Carrito del catálogo",
  revoke: "Mensaje eliminado",
  edit: "Mensaje editado",
};

export function describeMedia(mediaType: string | null): string | null {
  if (!mediaType) return null;
  return CONVERSATION_MEDIA_LABELS[mediaType] ?? mediaType;
}
