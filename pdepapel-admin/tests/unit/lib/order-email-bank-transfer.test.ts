import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildBankTransferBlock, buildOrderEmails } from "@/lib/email";

// Valores de mentira: la cuenta real vive solo en Configuración (StoreSettings).
const info = { account: "Ahorros Banco Prueba 000-TEST-00", breBKey: "@llave-de-prueba", whatsappNumber: "573000000000" };

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
  payment: PaymentMethod.BankTransfer,
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

describe("«Cómo pagar» en el correo de una transferencia", () => {
  it("el «Pendiente de pago» de la clienta trae valor, referencia, cuenta, llave y el WhatsApp con el comprobante ya escrito", async () => {
    const { customer, admin } = buildOrderEmails(order, OrderStatus.PENDING, { bankTransfer: info });
    const body = await html(customer!);

    expect(body).toContain("Cómo pagar");
    expect(body).toContain("Valor a transferir");
    expect(body).toMatch(/\$\s?20\.000/);
    expect(body).toContain("ORD-1");
    expect(body).toContain(info.account);
    expect(body).toContain(info.breBKey);
    expect(body).toContain(`https://wa.me/573000000000?text=${encodeURIComponent("Hola, envío el comprobante del pedido #ORD-1")}`);
    expect(customer!.text).toContain("Cómo pagar");
    expect(customer!.text).toContain(`Llave Bre-B: ${info.breBKey}`);
    expect(customer!.text).toContain("Referencia: ORD-1");
    // El correo del panel no cambia.
    expect(await html(admin)).not.toContain("Cómo pagar");
  });

  it("con un dato vacío en Configuración no sale a medias: valor, referencia y «Escríbenos por WhatsApp para los datos de pago»", async () => {
    const { customer } = buildOrderEmails(order, OrderStatus.PENDING, { bankTransfer: { ...info, breBKey: null } });
    const body = await html(customer!);
    expect(body).toContain("Escríbenos por WhatsApp para los datos de pago");
    expect(body).not.toContain(info.account);
    expect(body).toContain("Escribirnos por WhatsApp");
    expect(customer!.text).toContain("Escríbenos por WhatsApp para los datos de pago");

    const noWhatsapp = buildBankTransferBlock({ orderNumber: "ORD-1", total: 25000, giftCardAmount: 0 } as never, { account: null, breBKey: null, whatsappNumber: null });
    expect(noWhatsapp).toMatchObject({ incomplete: true, whatsappUrl: null, amount: expect.stringMatching(/25\.000/) });
  });

  it("solo para una transferencia pendiente: ni el pago en línea ni el pago confirmado lo llevan", async () => {
    const online = buildOrderEmails({ ...(order as object), payment: PaymentMethod.Bold } as never, OrderStatus.PENDING, { bankTransfer: info });
    const paid = buildOrderEmails(order, OrderStatus.PAID, { bankTransfer: info });
    expect(await html(online.customer!)).not.toContain("Cómo pagar");
    expect(await html(paid.customer!)).not.toContain("Cómo pagar");
    expect(paid.customer!.text).not.toContain("Cómo pagar");
  });
});
