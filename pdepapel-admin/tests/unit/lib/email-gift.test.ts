import { render } from "@react-email/render";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un pedido regalo manda dos correos distintos: el recibo completo a quien
 * compra y, solo con el pago confirmado, un aviso sin productos ni precios a
 * quien recibe. Estas pruebas fijan a quién le llega qué, y cuándo.
 */
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  recordFailedNotification: vi.fn(),
  claimUpsert: vi.fn(),
  findOrder: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production" } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["avisos@prueba.test"] }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } } }));
vi.mock("@/lib/notification-failures", () => ({
  recordFailedNotification: mocks.recordFailedNotification,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    orderAccountClaim: { upsert: mocks.claimUpsert },
    order: { findUnique: mocks.findOrder },
  },
}));
vi.mock("@/lib/utils", () => ({
  currencyFormatter: (value: number) => `$ ${value}`,
  getReadablePaymentMethod: () => "Pago en línea",
  getReadableStatus: (status: string) => `estado ${status}`,
}));

import { sendOrderEmail, sendShippingEmail } from "@/lib/email";

const baseOrder = {
  id: "order-1",
  storeId: "store-1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  email: "luisa@example.com",
  phone: "+573009999999",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  subtotal: 85900,
  discount: 0,
  couponDiscount: 0,
  total: 85900,
  userId: "user-1",
  type: "STANDARD",
  orderItems: [{ name: "Cuaderno cosido Osito", quantity: 2, price: 18000 }],
  shipping: { trackingCode: "GUIA123" },
  payment: { method: PaymentMethod.Bold },
};

const giftOrder = {
  ...baseOrder,
  isGift: true,
  giftRecipientName: "Mariana López",
  giftRecipientEmail: "mariana@example.com",
  giftRecipientPhone: null,
  giftMessage: "¡Feliz cumpleaños!",
};

/** Lo que devuelve la base para el id que recibe el correo. */
const stored = (order: object) => {
  mocks.findOrder.mockResolvedValue(order);
  return "order-1";
};

const sentTo = () =>
  mocks.send.mock.calls.map((call) => (call[0] as { to: string[] }).to.join(","));

/** React deja `<!-- -->` entre texto e interpolaciones; se quitan para leer el texto seguido. */
const renderText = async (element: ReactElement) =>
  (await render(element)).replace(/<!--[\s\S]*?-->/g, "");

const htmlOf = async (index: number) =>
  renderText((mocks.send.mock.calls[index][0] as { react: ReactElement }).react);

describe("gift order emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ data: { id: "email-1" } });
    mocks.claimUpsert.mockResolvedValue({});
  });

  it("does not announce the gift while the order is still pending", async () => {
    await sendOrderEmail(stored(giftOrder), OrderStatus.PENDING);

    expect(sentTo()).toEqual([
      "avisos@prueba.test",
      "luisa@example.com",
    ]);
  });

  it("sends the buyer the full receipt and the recipient a spoiler-free notice on payment", async () => {
    await sendOrderEmail(stored(giftOrder), OrderStatus.PAID);

    expect(sentTo()).toEqual([
      "avisos@prueba.test",
      "luisa@example.com",
      "mariana@example.com",
    ]);

    const adminHtml = await htmlOf(0);
    expect(adminHtml).toContain("Regalo para");
    expect(adminHtml).toContain("Mariana López");

    const buyerHtml = await htmlOf(1);
    expect(buyerHtml).toContain("Es un regalo para Mariana López");
    expect(buyerHtml).toContain("Cuaderno cosido Osito");
    expect(buyerHtml).toContain("$ 36000");

    const gift = mocks.send.mock.calls[2][0] as {
      subject: string;
      text: string;
      react: ReactElement;
    };
    expect(gift.subject).toBe("Luisa Sánchez te envió un regalo de P de Papel");
    const giftHtml = await renderText(gift.react);
    expect(giftHtml).toContain("Mariana, alguien pensó en ti.");
    expect(giftHtml).toContain("¡Feliz cumpleaños!");
    for (const forbidden of ["Cuaderno", "$ ", "Ver mi pedido", "ORD-1", "/pedido/"]) {
      expect(giftHtml).not.toContain(forbidden);
      expect(gift.text).not.toContain(forbidden);
    }
  });

  it("leaves a normal order exactly as before", async () => {
    await sendOrderEmail(stored(baseOrder), OrderStatus.PAID);

    expect(sentTo()).toEqual([
      "avisos@prueba.test",
      "luisa@example.com",
    ]);
    expect(await htmlOf(1)).not.toContain("Es un regalo");
  });

  it("does not double-mail the buyer when the recipient email is her own", async () => {
    await sendOrderEmail(
      stored({ ...giftOrder, giftRecipientEmail: "LUISA@example.com" }),
      OrderStatus.PAID,
    );

    expect(sentTo()).toEqual([
      "avisos@prueba.test",
      "luisa@example.com",
    ]);
  });

  it("keeps the recipient in the loop on shipping updates, with the guide and no prices", async () => {
    await sendShippingEmail(stored(giftOrder), ShippingStatus.OutForDelivery);

    expect(sentTo()).toEqual([
      "avisos@prueba.test",
      "luisa@example.com",
      "mariana@example.com",
    ]);
    const gift = mocks.send.mock.calls[2][0] as { subject: string; react: ReactElement };
    expect(gift.subject).toContain("Tu regalo de Luisa Sánchez");
    const giftHtml = await renderText(gift.react);
    expect(giftHtml).toContain("Tu regalo llega hoy.");
    expect(giftHtml).toContain("GUIA123");
    expect(giftHtml).not.toContain("Cuaderno");
    expect(giftHtml).not.toContain("$ ");
  });

  it("records a failed gift notice without losing the buyer's email", async () => {
    mocks.send
      .mockResolvedValueOnce({ data: { id: "admin" } })
      .mockResolvedValueOnce({ data: { id: "buyer" } })
      .mockRejectedValueOnce(new Error("resend down"));

    await sendOrderEmail(stored(giftOrder), OrderStatus.PAID);

    expect(sentTo()).toHaveLength(3);
    expect(mocks.recordFailedNotification).toHaveBeenCalledTimes(1);
    expect(mocks.recordFailedNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "gift:PAID",
        recipient: "mariana@example.com",
        orderId: "order-1",
      }),
    );
  });
});
