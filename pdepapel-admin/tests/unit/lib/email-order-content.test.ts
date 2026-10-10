import { render } from "@react-email/render";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresión del 2026-10-07: el «Pago confirmado» de ORD-1791380325794-318
 * salió con «Sin artículos registrados.». El cambio de estado desde el panel
 * armaba el pedido del correo con id, número, estado, correo y nombre, sin
 * artículos ni totales. Ahora el correo recibe solo el id y carga el pedido
 * con una única consulta; estas pruebas pintan el HTML de verdad, para cada
 * estado que manda correo, y miran que estén los artículos, las cantidades
 * y los totales.
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
vi.mock("@/lib/notification-failures", () => ({ recordFailedNotification: mocks.recordFailedNotification }));
vi.mock("@/lib/prismadb", () => ({
  default: { orderAccountClaim: { upsert: mocks.claimUpsert }, order: { findUnique: mocks.findOrder } },
}));

const ADMIN_EMAIL_RECIPIENTS = ["avisos@prueba.test"];
import { ORDER_EMAIL_INCLUDE, sendOrderEmail, sendShippingEmail } from "@/lib/email";
import { currencyFormatter } from "@/lib/utils";

const ORDER_ID = "order-email-1";

/** Dos líneas (una con cantidad), descuento de cupón y envío cobrado. */
const dbOrder = {
  id: ORDER_ID,
  storeId: "store-1",
  orderNumber: "ORD-EMAIL-1",
  status: OrderStatus.PAID,
  fullName: "Sol Prueba",
  email: "sol@example.com",
  phone: "+573000000018",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  subtotal: 33000,
  discount: 0,
  couponDiscount: 3000,
  total: 36200,
  userId: null,
  type: "STANDARD",
  isGift: false,
  giftRecipientName: null,
  giftRecipientEmail: null,
  orderItems: [
    { name: "Lapicero Halloween", quantity: 6, price: 2500, product: { name: "Lapicero Halloween" } },
    // Sin nombre congelado (pedido viejo): sale el del producto.
    { name: "", quantity: 1, price: 18000, product: { name: "Cuaderno cosido Osito" } },
  ],
  shipping: { status: ShippingStatus.Preparing, cost: 6200, envioClickIdRate: 77, trackingCode: null },
  payment: { method: PaymentMethod.BankTransfer },
};

const money = (value: number) => currencyFormatter(value);
/**
 * React deja `<!-- -->` entre texto e interpolaciones; se quitan para leer el
 * texto seguido. Y `render` 2.x de @react-email (el de las pruebas) mete a
 * veces un NUL antes de un espacio duro según el largo del documento; el
 * `renderAsync` con el que Resend arma el correo de verdad no lo hace
 * (comprobado el 2026-10-07 con los 18 correos de pedido), así que se quita.
 */
const html = async (call: unknown[]) =>
  (await render((call[0] as { react: ReactElement }).react))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\u0000/g, "");
const isAdmin = (call: unknown[]) =>
  JSON.stringify((call[0] as { to: string[] }).to) === JSON.stringify(ADMIN_EMAIL_RECIPIENTS);

async function expectFullOrder(call: unknown[]) {
  const body = await html(call);
  expect(body).not.toContain("Sin artículos registrados.");
  expect(body).toContain("Lapicero Halloween");
  expect(body).toContain("×6");
  expect(body).toContain(money(15000)); // 6 × 2.500, el precio de la línea
  expect(body).toContain("Cuaderno cosido Osito");
  expect(body).toContain(money(18000));
  expect(body).toContain("Subtotal");
  expect(body).toContain(money(33000));
  expect(body).toContain("Cupón");
  expect(body).toContain(`−${money(3000)}`);
  expect(body).toContain("Envío");
  expect(body).toContain(money(6200));
  expect(body).toContain("Total");
  expect(body).toContain(money(36200));
  const text = (call[0] as { text: string }).text;
  expect(text).toContain("• Lapicero Halloween x6");
  expect(text).toContain("• Cuaderno cosido Osito x1");
  expect(text).toContain(`Total: ${money(36200)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ data: { id: "em" }, error: null });
  mocks.claimUpsert.mockResolvedValue({});
  mocks.findOrder.mockResolvedValue(dbOrder);
});

describe("order emails carry the items and totals for every status", () => {
  it.each([OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SENT, OrderStatus.CANCELLED])(
    "%s: admin and customer emails list both items, quantities and totals",
    async (status) => {
      await sendOrderEmail(ORDER_ID, status);

      expect(mocks.send).toHaveBeenCalledTimes(2);
      for (const call of mocks.send.mock.calls) await expectFullOrder(call);
    },
  );

  it.each([
    ShippingStatus.Preparing,
    ShippingStatus.Shipped,
    ShippingStatus.InTransit,
    ShippingStatus.OutForDelivery,
    ShippingStatus.Delivered,
  ])("shipping %s: admin and customer emails list both items, quantities and totals", async (status) => {
    await sendShippingEmail(ORDER_ID, status);

    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const call of mocks.send.mock.calls) await expectFullOrder(call);
  });

  it("loads the order itself with the one canonical include, whatever the caller knows", async () => {
    await sendOrderEmail(ORDER_ID, OrderStatus.PAID, { notifyAdmin: false });

    expect(mocks.findOrder).toHaveBeenCalledWith({ where: { id: ORDER_ID }, include: ORDER_EMAIL_INCLUDE });
    expect(ORDER_EMAIL_INCLUDE.orderItems.include.product).toBeTruthy();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(isAdmin(mocks.send.mock.calls[0])).toBe(false);
    await expectFullOrder(mocks.send.mock.calls[0]);
  });

  it("the panel's «Enviado» subject is Spanish, not the enum", async () => {
    await sendOrderEmail(ORDER_ID, OrderStatus.SENT);

    const subjects = mocks.send.mock.calls.map((call) => (call[0] as { subject: string }).subject);
    expect(subjects).toEqual(["[Admin] Pedido #ORD-EMAIL-1 - Enviado", "Tu pedido #ORD-EMAIL-1 - Enviado"]);
  });

  it("keeps the checkout overrides: Clerk email when the form had none, gift-card payment", async () => {
    mocks.findOrder.mockResolvedValue({ ...dbOrder, email: null });

    await sendOrderEmail(ORDER_ID, OrderStatus.PAID, {
      customerEmail: "sesion@example.com",
      paymentMethod: PaymentMethod.GiftCard,
    });

    const customer = mocks.send.mock.calls.find((call) => !isAdmin(call))!;
    expect((customer[0] as { to: string[] }).to).toEqual(["sesion@example.com"]);
    await expectFullOrder(customer);
  });

  it("without discounts or a shipping quote the total is just the items, with no extra rows", async () => {
    mocks.findOrder.mockResolvedValue({ ...dbOrder, couponDiscount: 0, subtotal: 33000, total: 33000, shipping: null });

    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);

    const body = await html(mocks.send.mock.calls[1]);
    expect(body).toContain("Lapicero Halloween");
    expect(body).toContain(money(33000));
    expect(body).not.toContain("Subtotal");
    expect(body).not.toContain("Envío");
  });

  it("says «Gratis» only for a quoted shipping that came out at zero", async () => {
    mocks.findOrder.mockResolvedValue({ ...dbOrder, total: 30000, shipping: { ...dbOrder.shipping, cost: 0 } });
    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);
    expect(await html(mocks.send.mock.calls[1])).toContain("Gratis");

    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ data: { id: "em" }, error: null });
    mocks.findOrder.mockResolvedValue({ ...dbOrder, total: 30000, shipping: { ...dbOrder.shipping, cost: 0, envioClickIdRate: null } });
    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);
    expect(await html(mocks.send.mock.calls[1])).not.toContain("Gratis");
  });

  it("sends nothing and records nothing for an order that no longer exists", async () => {
    mocks.findOrder.mockResolvedValue(null);

    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.recordFailedNotification).not.toHaveBeenCalled();
  });

  it("records a failure per role when the order cannot be read", async () => {
    mocks.findOrder.mockRejectedValue(new Error("Can't reach database server"));

    const outcomes = await sendOrderEmail(ORDER_ID, OrderStatus.PAID);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(outcomes).toMatchObject({ admin: { ok: false }, customer: { ok: false } });
    expect(mocks.recordFailedNotification.mock.calls.map((call) => [call[0].orderId, call[0].recipient]).sort()).toEqual([
      [ORDER_ID, "admin"],
      [ORDER_ID, "customer"],
    ]);
  });
});

describe("gift recipient notice never shows money (2026-10-07 approval, adjustment 1)", () => {
  const giftOrder = {
    ...dbOrder,
    isGift: true,
    giftRecipientName: "Mariana López",
    giftRecipientEmail: "mariana@example.com",
    giftMessage: "¡Feliz cumpleaños!",
    shipping: { ...dbOrder.shipping, trackingCode: "GUIA123" },
  };
  const MONEY_LABELS = ["Subtotal", "Envío", "Total", "Cupón", "Descuento"];

  async function expectNoMoney() {
    const giftCall = mocks.send.mock.calls.find(
      (call) => JSON.stringify((call[0] as { to: string[] }).to) === '["mariana@example.com"]',
    );
    expect(giftCall).toBeDefined();
    const payload = giftCall![0] as { subject: string; text: string; react: ReactElement };
    const body = await html(giftCall!);
    for (const content of [body, payload.text, payload.subject]) {
      expect(content).not.toContain("$");
      expect(content).not.toContain("Lapicero");
      expect(content).not.toContain("Cuaderno");
      expect(content).not.toContain("ORD-EMAIL-1");
    }
    for (const label of MONEY_LABELS) expect(body).not.toMatch(new RegExp(`>\\s*${label}\\s*<`));
    // El recibo de quien compra sí lleva el bloque de totales.
    const buyer = mocks.send.mock.calls.find((call) => JSON.stringify((call[0] as { to: string[] }).to) === '["sol@example.com"]')!;
    await expectFullOrder(buyer);
  }

  beforeEach(() => mocks.findOrder.mockResolvedValue(giftOrder));

  it("PAID: the recipient gets the notice, with no prices, items or totals", async () => {
    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);
    await expectNoMoney();
  });

  it.each(Object.values(ShippingStatus))("shipping %s: the recipient notice has no prices, items or totals", async (status) => {
    await sendShippingEmail(ORDER_ID, status);
    await expectNoMoney();
  });
});

describe("account-claim link (adjustment 2)", () => {
  beforeEach(() => mocks.findOrder.mockResolvedValue({ ...dbOrder, status: OrderStatus.PENDING }));

  it("checkout and webhooks keep creating it on PENDING", async () => {
    await sendOrderEmail(ORDER_ID, OrderStatus.PENDING);
    expect(mocks.claimUpsert).toHaveBeenCalledTimes(1);
  });

  it("a panel status change (accountClaim: false) never creates an OrderAccountClaim", async () => {
    await sendOrderEmail(ORDER_ID, OrderStatus.PENDING, { notifyAdmin: false, accountClaim: false });
    expect(mocks.claimUpsert).not.toHaveBeenCalled();
    const customer = mocks.send.mock.calls[0][0] as { text: string };
    expect(customer.text).not.toContain("guardar-pedido");
  });
});

describe("placeholder customer addresses (adjustment 4)", () => {
  const placeholder = "  ClientesVarios@Gmail.com ";
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  const sentTo = () => mocks.send.mock.calls.map((call) => (call[0] as { to: string[] }).to.join(","));

  it.each([OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SENT, OrderStatus.CANCELLED])(
    "%s: the admin email goes out, the customer one is skipped with an info log and no failure row",
    async (status) => {
      mocks.findOrder.mockResolvedValue({ ...dbOrder, email: placeholder });

      const outcomes = await sendOrderEmail(ORDER_ID, status);

      expect(sentTo()).toEqual([ADMIN_EMAIL_RECIPIENTS.join(",")]);
      expect(outcomes).not.toHaveProperty("customer");
      expect(info).toHaveBeenCalledWith(expect.stringContaining("correo de relleno"));
      expect(mocks.recordFailedNotification).not.toHaveBeenCalled();
      expect(mocks.claimUpsert).not.toHaveBeenCalled();
    },
  );

  it("shipping emails: admin only", async () => {
    mocks.findOrder.mockResolvedValue({ ...dbOrder, email: placeholder });

    await sendShippingEmail(ORDER_ID, ShippingStatus.Delivered);

    expect(sentTo()).toEqual([ADMIN_EMAIL_RECIPIENTS.join(",")]);
    expect(mocks.recordFailedNotification).not.toHaveBeenCalled();
  });

  it("a gift recipient with a placeholder address gets no notice", async () => {
    mocks.findOrder.mockResolvedValue({
      ...dbOrder,
      isGift: true,
      giftRecipientName: "Alguien",
      giftRecipientEmail: "clientesvarios@gmail.com",
    });

    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);

    expect(sentTo()).toEqual([ADMIN_EMAIL_RECIPIENTS.join(","), "sol@example.com"]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("no se avisa el regalo"));
  });

  it("when the order cannot be read, both roles are still recorded for the retry sweep", async () => {
    // Sin pedido leído no se sabe si el correo es de relleno; el barrido lo
    // vuelve a leer y entonces sí se salta a la clienta.
    mocks.findOrder.mockRejectedValue(new Error("db down"));
    await sendOrderEmail(ORDER_ID, OrderStatus.PAID);
    expect(mocks.recordFailedNotification).toHaveBeenCalledTimes(2);
  });
});

describe("isPlaceholderEmail", () => {
  it("matches the list trimmed and case-insensitively, and nothing else", async () => {
    const { isPlaceholderEmail, PLACEHOLDER_CUSTOMER_EMAILS } = await import("@/lib/placeholder-emails");
    expect(PLACEHOLDER_CUSTOMER_EMAILS).toEqual(["clientesvarios@gmail.com"]);
    expect(isPlaceholderEmail("clientesvarios@gmail.com")).toBe(true);
    expect(isPlaceholderEmail(" CLIENTESVARIOS@GMAIL.COM\n")).toBe(true);
    expect(isPlaceholderEmail("clientesvarios2@gmail.com")).toBe(false);
    expect(isPlaceholderEmail("sol@example.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail("")).toBe(false);
  });
});
