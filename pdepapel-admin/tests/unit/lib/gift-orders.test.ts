import { describe, expect, it } from "vitest";

import {
  EMPTY_GIFT_FIELDS,
  GIFT_MESSAGE_MAX,
  getGiftNotificationEmail,
  getShippingContact,
  isGiftOrder,
  normalizeGiftFields,
} from "@/lib/gift-orders";

describe("normalizeGiftFields", () => {
  it("leaves everything null when the order is not a gift, even with leftovers", () => {
    expect(
      normalizeGiftFields({
        isGift: false,
        giftRecipientName: "Mariana",
        giftRecipientEmail: "mariana@example.com",
        giftMessage: "hola",
      }),
    ).toEqual(EMPTY_GIFT_FIELDS);
    expect(normalizeGiftFields({})).toEqual(EMPTY_GIFT_FIELDS);
    // Una cadena «true» no es la bandera: solo el booleano enciende el regalo.
    expect(normalizeGiftFields({ isGift: "true", giftRecipientName: "X" })).toEqual(
      EMPTY_GIFT_FIELDS,
    );
  });

  it("trims the name, lowercases the email and normalizes the phone", () => {
    expect(
      normalizeGiftFields({
        isGift: true,
        giftRecipientName: "  Mariana López ",
        giftRecipientEmail: " Mariana@Example.com ",
        giftRecipientPhone: "300 123 4567",
        giftMessage: "  ¡Feliz cumple!  ",
      }),
    ).toEqual({
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientEmail: "mariana@example.com",
      giftRecipientPhone: "+573001234567",
      giftMessage: "¡Feliz cumple!",
    });
  });

  it("keeps optional fields null when they come empty", () => {
    expect(
      normalizeGiftFields({ isGift: true, giftRecipientName: "Mariana" }),
    ).toEqual({
      isGift: true,
      giftRecipientName: "Mariana",
      giftRecipientEmail: null,
      giftRecipientPhone: null,
      giftMessage: null,
    });
  });

  it("refuses a gift without the recipient name", () => {
    expect(() => normalizeGiftFields({ isGift: true })).toThrow(
      "Escribe el nombre de quien recibe el regalo",
    );
    expect(() =>
      normalizeGiftFields({ isGift: true, giftRecipientName: " A " }),
    ).toThrow("Escribe el nombre de quien recibe el regalo");
  });

  it("refuses an invalid recipient email and an overlong message", () => {
    expect(() =>
      normalizeGiftFields({
        isGift: true,
        giftRecipientName: "Mariana",
        giftRecipientEmail: "no-es-correo",
      }),
    ).toThrow("El correo de quien recibe el regalo no es válido");
    expect(() =>
      normalizeGiftFields({
        isGift: true,
        giftRecipientName: "Mariana",
        giftMessage: "x".repeat(GIFT_MESSAGE_MAX + 1),
      }),
    ).toThrow(`menos de ${GIFT_MESSAGE_MAX} caracteres`);
  });

  it("answers 400 so the route maps it to a customer-facing error", () => {
    try {
      normalizeGiftFields({ isGift: true });
      throw new Error("expected to throw");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});

describe("isGiftOrder", () => {
  it("needs both the flag and a recipient name", () => {
    expect(isGiftOrder({ isGift: true, giftRecipientName: "Mariana" })).toBe(true);
    expect(isGiftOrder({ isGift: true, giftRecipientName: null })).toBe(false);
    expect(isGiftOrder({ isGift: false, giftRecipientName: "Mariana" })).toBe(false);
    expect(isGiftOrder({})).toBe(false);
  });
});

describe("getShippingContact", () => {
  const buyer = { fullName: "Luisa Sánchez", phone: "+573009999999" };

  it("ships to the buyer on a normal order", () => {
    expect(getShippingContact(buyer)).toEqual({
      fullName: "Luisa Sánchez",
      phone: "+573009999999",
    });
  });

  it("ships to the recipient on a gift, with her phone when she left one", () => {
    expect(
      getShippingContact({
        ...buyer,
        isGift: true,
        giftRecipientName: "Mariana López",
        giftRecipientPhone: "+573001234567",
      }),
    ).toEqual({ fullName: "Mariana López", phone: "+573001234567" });
  });

  it("falls back to the buyer's phone when the recipient left none", () => {
    expect(
      getShippingContact({
        ...buyer,
        isGift: true,
        giftRecipientName: "Mariana López",
        giftRecipientPhone: null,
      }),
    ).toEqual({ fullName: "Mariana López", phone: "+573009999999" });
  });
});

describe("getGiftNotificationEmail", () => {
  it("returns the recipient email for a gift with one", () => {
    expect(
      getGiftNotificationEmail({
        email: "luisa@example.com",
        isGift: true,
        giftRecipientName: "Mariana",
        giftRecipientEmail: "mariana@example.com",
      }),
    ).toBe("mariana@example.com");
  });

  it("returns null without a recipient email, or when it is the buyer's own address", () => {
    expect(
      getGiftNotificationEmail({
        email: "luisa@example.com",
        isGift: true,
        giftRecipientName: "Mariana",
        giftRecipientEmail: null,
      }),
    ).toBeNull();
    expect(
      getGiftNotificationEmail({
        email: "Luisa@Example.com",
        isGift: true,
        giftRecipientName: "Mariana",
        giftRecipientEmail: "luisa@example.com ",
      }),
    ).toBeNull();
    expect(
      getGiftNotificationEmail({
        email: "luisa@example.com",
        isGift: false,
        giftRecipientEmail: "mariana@example.com",
      }),
    ).toBeNull();
  });
});
