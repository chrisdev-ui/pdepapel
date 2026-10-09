import { OrderStatus, OrderType } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildOrderEmails, shouldNotifyAdmin } from "@/lib/email";

const base = {
  id: "order-1",
  storeId: "store-1",
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

  it("una tarjeta pagada en revisión avisa al panel con su propio asunto y el enlace al pedido", async () => {
    const { admin } = buildOrderEmails({ ...(base as object), giftCardReview: "PENDING" } as never, OrderStatus.PAID);
    expect(admin.subject).toBe("🎁 Tarjeta de regalo esperando aprobación — #ORD-1");
    expect(admin.text).toContain("/pedidos/order-1");
    expect(await html(admin)).toContain("Apruébala o recházala en el pedido");
  });

  it("si además parece un bot, el asunto lo dice primero", () => {
    const { admin } = buildOrderEmails({ ...(base as object), giftCardReview: "PENDING", riskScore: 2, riskReasons: "envio-rapido" } as never, OrderStatus.PAID);
    expect(admin.subject).toBe("⚠️ Posible bot · 🎁 Tarjeta de regalo esperando aprobación — #ORD-1");
  });

  it("a la clienta le dice cuánto tarda, sin prometer el código ya enviado", () => {
    const { customer } = buildOrderEmails({ ...(base as object), giftCardReview: "PENDING" } as never, OrderStatus.PAID);
    expect(customer!.text).toContain("La revisamos en menos de 24 horas hábiles y te llega a tu correo");
    expect(customer!.text).not.toContain("ya salió");
  });

  it("el aviso al panel sale aunque quien marcó el pago fuera la dueña, solo cuando la tarjeta queda en revisión", () => {
    const held = { ...(base as object), giftCardReview: "PENDING" } as never;
    expect(shouldNotifyAdmin(held, OrderStatus.PAID, { notifyAdmin: false })).toBe(true);
    expect(shouldNotifyAdmin(base, OrderStatus.PAID, { notifyAdmin: false })).toBe(false);
    expect(shouldNotifyAdmin(base, OrderStatus.PAID, {})).toBe(true);
    expect(shouldNotifyAdmin(held, OrderStatus.PENDING, { notifyAdmin: false })).toBe(false);
  });
});
