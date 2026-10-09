import { OrderStatus, OrderType } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { FRONTEND_STORE_URL: "https://tienda.example" } }));

import { buildOrderEmails } from "@/lib/email";

const base = {
  id: "order-1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  email: "luisa@example.com",
  phone: "+573001234567",
  address: "",
  city: null,
  total: 100000,
  subtotal: 100000,
  discount: 0,
  couponDiscount: 0,
  giftCardAmount: 0,
  type: OrderType.GIFT_CARD,
  orderItems: [],
  payment: null,
  shipping: null,
  coupon: null,
  isGift: false,
  giftRecipientName: null,
  giftRecipientEmail: null,
  riskScore: 0,
  riskReasons: null,
  giftCardReview: null,
} as never;

const html = (email: { react: unknown }) => render(email.react as never);

describe("correos de pedidos con riesgo", () => {
  it("un pedido marcado lleva «⚠️ Posible bot» en el asunto y los motivos en el aviso del panel", async () => {
    const { admin, customer } = buildOrderEmails({ ...(base as object), riskScore: 2, riskReasons: "envio-rapido" } as never, OrderStatus.PENDING);
    expect(admin.subject).toBe("⚠️ Posible bot · [Admin] Pedido #ORD-1 - Pendiente de pago");
    expect(admin.text).toContain("⚠️ Posible bot: Formulario enviado en segundos");
    expect(await html(admin)).toContain("Formulario enviado en segundos");
    expect(customer?.subject).not.toContain("bot");
    expect(await html(customer!)).not.toContain("Posible bot");
  });

  it("un pedido sin señales no cambia", async () => {
    const { admin } = buildOrderEmails(base, OrderStatus.PENDING);
    expect(admin.subject).toBe("[Admin] Pedido #ORD-1 - Pendiente de pago");
    expect(await html(admin)).not.toContain("Posible bot");
  });

  it("una tarjeta pagada en revisión lo dice al panel y a la clienta, sin prometer el código ya enviado", async () => {
    const { admin, customer } = buildOrderEmails({ ...(base as object), giftCardReview: "PENDING" } as never, OrderStatus.PAID);
    expect(admin.subject).toContain("Tarjeta en revisión");
    expect(await html(admin)).toContain("Apruébala o recházala en el pedido");
    expect(customer!.text).toContain("Estamos verificando la compra");
    expect(customer!.text).not.toContain("ya salió");
  });
});
