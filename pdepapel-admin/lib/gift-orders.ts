import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import { normalizePhone } from "@/lib/phone";

/**
 * Pedidos como regalo.
 *
 * Un pedido tiene una sola identidad: `email`, `fullName`, `phone` y
 * `documentId` son de quien COMPRA (cuenta, beneficio de bienvenida,
 * Clientes, DIAN, recibo completo). Quien RECIBE va en los campos `gift*`:
 * la transportadora usa su nombre y teléfono, y a su correo llega solo un
 * aviso sin productos, precios ni enlace del pedido.
 *
 * Aquí viven las reglas puras (validación, a quién se avisa, quién recibe
 * el paquete) para que checkout, pedidos del panel, correos y guías digan
 * exactamente lo mismo.
 */

export const GIFT_RECIPIENT_NAME_MAX = 100;
export const GIFT_RECIPIENT_EMAIL_MAX = 60;
export const GIFT_MESSAGE_MAX = 300;

export interface GiftFields {
  isGift: boolean;
  giftRecipientName: string | null;
  giftRecipientEmail: string | null;
  giftRecipientPhone: string | null;
  giftMessage: string | null;
}

export const EMPTY_GIFT_FIELDS: GiftFields = {
  isGift: false,
  giftRecipientName: null,
  giftRecipientEmail: null,
  giftRecipientPhone: null,
  giftMessage: null,
};

const trimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const emailSchema = z.string().email().max(GIFT_RECIPIENT_EMAIL_MAX);

/**
 * Normaliza lo que llega del formulario (tienda o panel). Con `isGift`
 * apagado todo queda en `null`, aunque el cuerpo traiga restos de un
 * intento anterior: un pedido que no es regalo no guarda datos de terceros.
 *
 * Lanza 400 con un mensaje para la clienta cuando falta el nombre de quien
 * recibe o el correo no es válido.
 */
export function normalizeGiftFields(input: Record<string, unknown>): GiftFields {
  if (input.isGift !== true) return { ...EMPTY_GIFT_FIELDS };

  const giftRecipientName = trimmed(input.giftRecipientName);
  if (giftRecipientName.length < 2) {
    throw ErrorFactory.InvalidRequest(
      "Escribe el nombre de quien recibe el regalo",
    );
  }
  if (giftRecipientName.length > GIFT_RECIPIENT_NAME_MAX) {
    throw ErrorFactory.InvalidRequest(
      `El nombre de quien recibe debe tener menos de ${GIFT_RECIPIENT_NAME_MAX} caracteres`,
    );
  }

  const rawEmail = trimmed(input.giftRecipientEmail).toLowerCase();
  if (rawEmail && !emailSchema.safeParse(rawEmail).success) {
    throw ErrorFactory.InvalidRequest(
      "El correo de quien recibe el regalo no es válido",
    );
  }

  const giftMessage = trimmed(input.giftMessage);
  if (giftMessage.length > GIFT_MESSAGE_MAX) {
    throw ErrorFactory.InvalidRequest(
      `El mensaje del regalo debe tener menos de ${GIFT_MESSAGE_MAX} caracteres`,
    );
  }

  const rawPhone = trimmed(input.giftRecipientPhone);
  const giftRecipientPhone = rawPhone ? normalizePhone(rawPhone) : "";

  return {
    isGift: true,
    giftRecipientName,
    giftRecipientEmail: rawEmail || null,
    giftRecipientPhone: giftRecipientPhone || null,
    giftMessage: giftMessage || null,
  };
}

type GiftOrderLike = {
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  isGift?: boolean | null;
  giftRecipientName?: string | null;
  giftRecipientEmail?: string | null;
  giftRecipientPhone?: string | null;
};

/** El pedido es un regalo con alguien que lo recibe. */
export function isGiftOrder(order: GiftOrderLike): boolean {
  return Boolean(order.isGift && order.giftRecipientName);
}

/**
 * A nombre de quién sale el paquete. En un regalo la transportadora llama
 * y entrega a quien recibe; el teléfono de quien compra sigue de respaldo
 * si no dejó el de la otra persona.
 */
export function getShippingContact(order: GiftOrderLike): {
  fullName: string;
  phone: string;
} {
  if (isGiftOrder(order)) {
    return {
      fullName: order.giftRecipientName as string,
      phone: order.giftRecipientPhone || order.phone || "",
    };
  }
  return { fullName: order.fullName || "", phone: order.phone || "" };
}

/**
 * A quién se le manda el aviso de regalo, o `null` si a nadie: no hay
 * correo, o es el mismo de quien compra (ya recibe el recibo completo, y un
 * segundo correo «sin precios» al mismo buzón solo confunde).
 */
export function getGiftNotificationEmail(order: GiftOrderLike): string | null {
  if (!isGiftOrder(order)) return null;
  const recipient = (order.giftRecipientEmail || "").trim().toLowerCase();
  if (!recipient) return null;
  const buyer = (order.email || "").trim().toLowerCase();
  return recipient === buyer ? null : recipient;
}
