import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildOrderEmails } from "@/lib/email";

const order = {
  id: "order-1",
  storeId: "store-1",
  orderNumber: "ORD-1",
  fullName: "Luisa Sánchez",
  email: "luisa@example.com",
  phone: "+573001234567",
  address: "",
  city: "Medellín",
  total: 25000,
  subtotal: 25000,
  discount: 0,
  couponDiscount: 0,
  giftCardAmount: 5000,
  type: OrderType.STANDARD,
  orderItems: [],
  payment: PaymentMethod.Bold,
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

describe("correo de «Enviado» de un pedido para recoger", () => {
  it("dice «Entregado» cuando no hay envío o es «Recoge en tienda»", async () => {
    for (const shipping of [null, { provider: ShippingProvider.NONE, status: ShippingStatus.Delivered, trackingCode: null, cost: 0 }]) {
      const { customer } = buildOrderEmails({ ...(order as object), shipping } as never, OrderStatus.SENT);
      expect(customer!.subject).toBe("¡Tu pedido #ORD-1 ha sido entregado!");
      const body = await html(customer!);
      expect(body).toContain("Tu pedido ya está en tus manos.");
      expect(body).not.toContain("salió de la papelería");
      expect(customer!.text).toContain("Esperamos que disfrutes tu compra");
    }
  });

  it("con transportadora sigue diciendo que salió", async () => {
    const shipping = { provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Shipped, trackingCode: "ENV-1", cost: 9000 };
    const { customer } = buildOrderEmails({ ...(order as object), shipping } as never, OrderStatus.SENT);
    expect(customer!.subject).not.toContain("entregado");
    expect(await html(customer!)).toContain("Tu pedido salió de la papelería.");
  });
});
