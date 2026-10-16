import type { Prisma } from "@prisma/client";

/**
 * Lo que la clienta hace sobre un mensaje sin escribir uno nuevo: reaccionar o
 * borrar. Se archiva como historial, pero no es «volvió a escribir»: no
 * reemplaza una respuesta pendiente del bot ni un aviso debido, no mueve
 * `lastInboundAt` y no abre ni alarga una espera.
 */
export const CUSTOMER_SIGNAL_TYPES = ["reaction", "revoke"] as const;

export type InboundKind = "message" | "signal";

export function inboundKindOf(mediaType: string | null | undefined): InboundKind {
  return mediaType && (CUSTOMER_SIGNAL_TYPES as readonly string[]).includes(mediaType) ? "signal" : "message";
}

export const isCustomerSignal = (mediaType: string | null | undefined) => inboundKindOf(mediaType) === "signal";

/** Filtro de Prisma para mensajes de verdad (`notIn` solo deja fuera los NULL, de ahí el OR). */
export const realInboundWhere: Prisma.ConversationMessageWhereInput = {
  OR: [{ mediaType: null }, { mediaType: { notIn: [...CUSTOMER_SIGNAL_TYPES] } }],
};
