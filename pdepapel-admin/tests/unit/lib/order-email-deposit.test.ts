import { OrderPaymentPlan, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "production", FRONTEND_STORE_URL: "https://tienda.example" } }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildOrderEmails } from "@/lib/email";

const info = { account: "Ahorros Banco Prueba 000-TEST-00", breBKey: "@llave-de-prueba", whatsappNumber: "573000000000" };

const order = (payment: PaymentMethod, status: OrderStatus) =>
  ({
    id: "order-1",
    storeId: "store-1",
    orderNumber: "ORD-1",
    status,
    fullName: "Luisa Sánchez",
    email: "luisa@example.com",
    phone: "+573001112233",
    address: "",
    city: "Medellín",
    total: 160000,
    subtotal: 160000,
    discount: 0,
    couponDiscount: 0,
    giftCardAmount: 0,
    paymentPlan: OrderPaymentPlan.DEPOSIT,
    depositAmount: 30000,
    type: OrderType.STANDARD,
    orderItems: [],
    payment,
    shipping: null,
    coupon: null,
    isGift: false,
    giftRecipientName: null,
    giftRecipientEmail: null,
    riskScore: 0,
    riskReasons: null,
    giftCardReview: null,
  }) as never;

const html = (email: { react: unknown }) => render(email.react as never);

/**
 * Correos de una preventa con anticipo: la transferencia pide solo el
 * anticipo; «Anticipo recibido» dice cuánto entró y el saldo que falta más el
 * envío; el pago del saldo agradece el saldo. Nunca «pago completo».
 */
describe("correos de una preventa con anticipo", () => {
  it("transferencia pendiente: el valor a transferir es el anticipo y explica el saldo", async () => {
    const { customer } = buildOrderEmails(order(PaymentMethod.BankTransfer, OrderStatus.PENDING), OrderStatus.PENDING, { bankTransfer: info });
    const body = await html(customer!);
    expect(body).toContain("Valor a transferir");
    expect(body).toMatch(/Valor a transferir[\s\S]{0,400}\$\s?30\.000/);
    expect(body).toMatch(/El saldo de \$\s?130\.000 más el envío lo pagas cuando llegue el producto/);
    expect(customer!.text).toMatch(/\$\s?30\.000/);
  });

  it("anticipo recibido: cuánto entró y el saldo que falta, sin hablar de despacho inmediato", async () => {
    const { customer } = buildOrderEmails(order(PaymentMethod.Bold, OrderStatus.DEPOSIT_PAID), OrderStatus.DEPOSIT_PAID);
    const body = await html(customer!);
    expect(body).toMatch(/Recibimos tu anticipo de \$\s?30\.000/);
    expect(body).toMatch(/saldo de \$\s?130\.000 más el envío/);
    expect(customer!.text).toMatch(/Recibimos tu anticipo de \$\s?30\.000/);
  });

  it("saldo pagado: agradece el saldo", async () => {
    const { customer } = buildOrderEmails(order(PaymentMethod.BankTransfer, OrderStatus.PAID), OrderStatus.PAID);
    const body = await html(customer!);
    expect(body).toContain("Recibimos el saldo de tu preventa");
  });

  // Abonos libres: lo pagado es la suma de los cobros aprobados, no el anticipo esperado.
  const withPayments = (status: OrderStatus, amounts: number[]) =>
    ({
      ...(order(PaymentMethod.BankTransfer, status) as object),
      payments: amounts.map((amount, index) => ({ kind: index === 0 ? "DEPOSIT" : "INSTALLMENT", status: "APPROVED", amount })),
    }) as never;

  it("…393: anticipo de $60.000 sobre $30.000 esperados → «Recibimos tu anticipo de $60.000», saldo $100.000", async () => {
    const { customer } = buildOrderEmails(withPayments(OrderStatus.DEPOSIT_PAID, [60000]), OrderStatus.DEPOSIT_PAID);
    const body = await html(customer!);
    expect(body).toMatch(/Recibimos tu anticipo de \$\s?60\.000/);
    expect(body).toMatch(/saldo de \$\s?100\.000 más el envío/);
  });

  it("«Abono recibido»: asunto propio, el abono, lo que lleva y lo que falta", async () => {
    const { customer, admin } = buildOrderEmails(withPayments(OrderStatus.DEPOSIT_PAID, [30000, 20000]), OrderStatus.DEPOSIT_PAID, { installmentAmount: 20000 });
    expect(customer!.subject).toBe("Tu pedido #ORD-1 - Abono recibido");
    expect(admin.subject).toBe("[Admin] Pedido #ORD-1 - Abono recibido");
    const body = await html(customer!);
    expect(body).toMatch(/Recibimos tu abono de \$\s?20\.000\. Llevas \$\s?50\.000 pagado de \$\s?160\.000; faltan \$\s?110\.000 más el envío/);
  });

  it("pagado todo con abonos: «Ya pagaste todo», solo falta el envío", async () => {
    const { customer } = buildOrderEmails(withPayments(OrderStatus.DEPOSIT_PAID, [30000, 130000]), OrderStatus.DEPOSIT_PAID, { installmentAmount: 130000 });
    expect(await html(customer!)).toMatch(/Ya pagaste todo \(\$\s?160\.000\): cuando llegue el producto solo falta el envío/);
  });
});
