import { OrderType } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildPaymentDeclinedEmail } from "@/lib/email";

const order = {
  id: "order-1",
  storeId: "store-1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  email: "luisa@example.com",
  phone: "+573001234567",
  address: "Calle 1",
  city: "Medellín",
  total: 25000,
  subtotal: 25000,
  discount: 0,
  couponDiscount: 0,
  giftCardAmount: 0,
  type: OrderType.STANDARD,
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

describe("correo de pago no aprobado", () => {
  it("invita a reintentar desde el pedido, con el diseño de la tienda y su texto plano; nunca dice «Cancelada»", async () => {
    const email = buildPaymentDeclinedEmail(order);
    const html = await render(email.react as never);

    expect(email.subject).toBe("Tu pago del pedido #ORD-1 no se aprobó: puedes intentarlo de nuevo");
    expect(html).toContain("Pago no aprobado");
    expect(html).toContain("Tu pago no se aprobó: puedes intentarlo de nuevo.");
    expect(html).toContain("Intentar el pago de nuevo");
    expect(html).toContain("https://papeleriapdepapel.com/pedido/order-1");
    expect(email.text).toContain("https://papeleriapdepapel.com/pedido/order-1");
    expect(email.text).toContain("próximas 2 horas");
    for (const body of [html, email.text, email.subject]) expect(body).not.toMatch(/Cancelad/);
  });
});
