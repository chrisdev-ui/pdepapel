import type { GiftCardMovementType, GiftCardStatus } from "@prisma/client";

/**
 * Textos y tonos de las tarjetas de regalo para el panel. Sin dependencias
 * de servidor: lo importan componentes de cliente.
 */
export const GIFT_CARD_MOVEMENT_LABELS: Record<GiftCardMovementType, string> = {
  ISSUED: "Emitida",
  HELD: "Reservada por un pedido",
  REDEEMED: "Usada",
  RELEASED: "Reserva liberada",
  REVERSED: "Devuelta al saldo",
  VOIDED: "Anulada",
  REISSUED: "Código nuevo",
};

export const GIFT_CARD_MOVEMENT_TONES: Record<GiftCardMovementType, string> = {
  ISSUED: "mint",
  HELD: "cream",
  REDEEMED: "sky",
  RELEASED: "slate",
  REVERSED: "lavender",
  VOIDED: "pink",
  REISSUED: "mint",
};

export const GIFT_CARD_STATUS_LABELS: Record<GiftCardStatus, string> = {
  ACTIVE: "Activa",
  VOID: "Anulada",
};

/** Estado que ve Paula: activa, sin saldo o anulada. */
export function getGiftCardBadge(card: { status: GiftCardStatus; balance: number }): {
  label: string;
  tone: string;
} {
  if (card.status === "VOID") return { label: "Anulada", tone: "pink" };
  if (Number(card.balance) <= 0) return { label: "Sin saldo", tone: "slate" };
  if (Number(card.balance) < Number.MAX_SAFE_INTEGER) return { label: "Activa", tone: "mint" };
  return { label: "Activa", tone: "mint" };
}

/** «Termina en 7K3M», lo único del código que se muestra. */
export const giftCardLast4Label = (last4: string) => `Termina en ${last4}`;
