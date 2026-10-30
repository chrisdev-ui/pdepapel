import { OrderStatus, OrderType, ShippingProvider } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildPreorderBalanceDueEmail, buildPreorderUnfulfilledEmail, depositThanksParagraph } from "@/lib/email";

const approved = (kind: string, amount: number) => ({ kind, status: "APPROVED", amount });

const order = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "order-1",
    storeId: "store-1",
    orderNumber: "ORD-1",
    fullName: "Luisa Sánchez",
    email: "luisa@example.com",
    phone: "+573001112233",
    address: "Calle 1",
    city: "Medellín",
    total: 172000,
    subtotal: 160000,
    discount: 0,
    couponDiscount: 0,
    giftCardAmount: 0,
    depositAmount: 30000,
    type: OrderType.STANDARD,
    orderItems: [{ name: "Calendario de adviento", quantity: 1, price: 160000, isPreorder: true }],
    payments: [approved("DEPOSIT", 30000), approved("INSTALLMENT", 20000)],
    payment: null,
    shipping: { provider: ShippingProvider.MANUAL, cost: 12000, codFee: null, isCOD: false, envioClickIdRate: null },
    coupon: null,
    isGift: false,
    giftRecipientName: null,
    giftRecipientEmail: null,
    riskScore: 0,
    riskReasons: null,
    giftCardReview: null,
    ...overrides,
  }) as never;

const plain = (text: string) => text.replace(/\s/g, " ");

/**
 * Los avisos de la preventa con las sumas reales: «Ya llegó» con el saldo
 * (producto que falta + envío), «sin unidad» con lo que pagó, y los de abono y
 * saldo recibido. Todos con el diseño de la tienda y su texto plano.
 */
describe("correos de la preventa: ya llegó, sin unidad, abono y saldo", () => {
  it("«Ya llegó»: saldo = total con envío − lo pagado, con el enlace para pagar", async () => {
    const email = buildPreorderBalanceDueEmail(order());
    const html = plain(await render(email.react as never));
    expect(email.subject).toBe("Ya llegó tu preventa: paga tu saldo del pedido #ORD-1");
    const paragraph = "¡Ya llegó Calendario de adviento! Llevas $ 50.000 pagado. Tu saldo es $ 122.000: lo que falta del producto más el envío de $ 12.000. Págalo desde tu pedido, en línea o por transferencia, y lo despachamos.";
    expect(plain(email.text)).toContain(paragraph);
    expect(html).toContain("Pagar mi saldo");
    expect(html).toContain("https://papeleriapdepapel.com/pedido/order-1");
    expect(email.text).toContain("Pagar mi saldo: https://papeleriapdepapel.com/pedido/order-1");
  });

  it("«Ya llegó» para recoger en la tienda: sin costo de envío", () => {
    const email = buildPreorderBalanceDueEmail(order({ total: 160000, shipping: { provider: ShippingProvider.NONE, cost: 0, codFee: null, isCOD: false, envioClickIdRate: null } }));
    expect(plain(email.text)).toContain("Tu saldo es $ 110.000: lo que falta del producto más el retiro en la tienda, sin costo.");
  });

  it("«Sin unidad»: no tiene que pagar más; dice cuánto se le devuelve", async () => {
    const email = buildPreorderUnfulfilledEmail(order({ total: 160000 }));
    expect(email.subject).toBe("Tu preventa del pedido #ORD-1: no alcanzó tu unidad");
    expect(plain(email.text)).toContain("te escribimos por WhatsApp para devolverte lo que pagaste ($ 50.000) o, si lo prefieres, dejarlo como saldo a favor para otra compra.");
    const html = plain(await render(email.react as never));
    expect(html).toContain("No alcanzó tu unidad");
    expect(html).not.toContain("Pagar mi saldo");
  });

  it("«Abono recibido» y «Saldo pagado» con las sumas reales", () => {
    const waiting = { total: 160000, depositAmount: 30000, payments: [approved("DEPOSIT", 30000), approved("INSTALLMENT", 20000)] } as never;
    expect(plain(depositThanksParagraph(waiting, OrderStatus.DEPOSIT_PAID, 20000))).toBe(
      "Recibimos tu abono de $ 20.000. Llevas $ 50.000 pagado de $ 160.000; faltan $ 110.000 más el envío, que pagas cuando llegue el producto.",
    );
    const paid = { total: 172000, depositAmount: 30000, payments: [], shipping: { cost: 12000 } } as never;
    expect(plain(depositThanksParagraph(paid, OrderStatus.PAID))).toBe(
      "¡Gracias! Recibimos el saldo de tu preventa: pagaste $ 172.000 en total, con el envío de $ 12.000. Estamos alistando tu pedido y te avisamos cuando salga.",
    );
  });
});
