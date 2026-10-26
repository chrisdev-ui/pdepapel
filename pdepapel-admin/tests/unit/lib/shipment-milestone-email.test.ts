import { render } from "@react-email/render";
import { OrderStatus, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

/** El correo de cada hito lleva la transportadora, la guía y dónde consultarla. */
vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production" } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["avisos@prueba.test"] }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildShipmentMilestoneEmails, type EmailOrder } from "@/lib/email";

function order(shipping: Partial<NonNullable<EmailOrder["shipping"]>>): EmailOrder {
  return {
    id: "order-hito-1",
    storeId: "store-1",
    orderNumber: "ORD-HITO-1",
    status: OrderStatus.PAID,
    fullName: "Sol Prueba",
    email: "sol@example.com",
    phone: "+573000000018",
    address: "Calle 1 # 2-3",
    city: "Medellín",
    subtotal: 20000,
    discount: 0,
    couponDiscount: 0,
    total: 29500,
    type: "STANDARD",
    isGift: false,
    giftRecipientName: null,
    giftRecipientEmail: null,
    payment: PaymentMethod.Bold,
    orderItems: [{ name: "Cuaderno cosido Osito", quantity: 1, price: 20000, product: { name: "Cuaderno cosido Osito" } }],
    shipping: { provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Shipped, trackingCode: "014151234567", carrierName: "ENVIA", courier: null, trackingUrl: null, cost: 9500, ...shipping },
  } as unknown as EmailOrder;
}

describe("correos de hitos de envío", () => {
  it("guía creada: «va en camino», con transportadora, guía y rastreo de EnvioClick", async () => {
    const { customer, admin } = buildShipmentMilestoneEmails(order({}), "guia_creada");
    expect(customer.subject).toBe("Tu pedido #ORD-HITO-1 va en camino");
    const html = await render(customer.react);
    expect(html).toContain("ENVIA");
    expect(html).toContain("014151234567");
    expect(html).toContain("envioclick.com/co/track/014151234567");
    expect(customer.text).toContain("Transportadora: ENVIA");
    expect(customer.text).toContain("Guía: 014151234567");
    expect(customer.text).toContain("https://papeleriapdepapel.com/pedido/order-hito-1");
    // La clienta nunca recibe la dirección ni el teléfono en su correo; el del panel sí.
    expect(customer.text).not.toContain("+573000000018");
    expect(admin.subject).toContain("[Admin]");
  });

  it("transportadora manual sin enlace: guía y transportadora, sin enlace de EnvioClick", async () => {
    const html = await render(
      buildShipmentMilestoneEmails(order({ provider: ShippingProvider.MANUAL, carrierName: null, courier: "Servientrega", trackingUrl: null }), "guia_creada").customer.react,
    );
    expect(html).toContain("Servientrega");
    expect(html).not.toContain("envioclick.com");
  });

  it("transportadora manual con su enlace de rastreo", async () => {
    const html = await render(
      buildShipmentMilestoneEmails(order({ provider: ShippingProvider.MANUAL, courier: "Interrapidísimo", trackingUrl: "https://interrapidisimo.com/rastreo?g=777" }), "en_camino").customer.react,
    );
    expect(html).toContain("https://interrapidisimo.com/rastreo?g=777");
  });

  it("cada hito tiene su asunto", () => {
    expect(buildShipmentMilestoneEmails(order({ status: ShippingStatus.OutForDelivery }), "en_reparto").customer.subject).toContain("sale hoy a entrega");
    expect(buildShipmentMilestoneEmails(order({ status: ShippingStatus.Delivered }), "entregado").customer.subject).toContain("ha sido entregado");
    expect(buildShipmentMilestoneEmails(order({ status: ShippingStatus.FailedDelivery }), "novedad").customer.subject).toContain("novedad");
  });
});
