import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PresaleDepositType,
  PresalePaymentMode,
  ProductPresaleStatus,
} from "@prisma/client";

import { generateGiftCardCode } from "@/lib/gift-card-codes";
import { KNOWN_LEGAL_VERSIONS } from "@/lib/legal-versions";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Preventa con anticipo por la caja de la tienda y por Wompi, contra MySQL:
 * la caja deja el pedido con anticipo (por unidad), envío en cero y un solo
 * cobro `-A` por el anticipo que firma la pasarela; rechaza lo que no se
 * puede mezclar (otro producto, cupón, tarjeta de regalo, contra entrega,
 * condiciones sin aceptar, más de 5 sin tope); reintentar el pago reutiliza
 * ese cobro y, con el anticipo pagado, no hay enlace; Wompi con la referencia
 * del anticipo deja «Anticipo recibido» una sola vez.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const gateway = vi.hoisted(() => ({ bold: vi.fn(), wompi: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendPaymentDeclinedEmail: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined),
  recordDepositInGoogleAnalytics: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/bold", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bold")>()),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
  generateBoldCheckoutData: (order: { id: string }, charge: unknown) => {
    gateway.bold(order.id, charge);
    return { orderId: order.id, integritySignature: "sig" };
  },
}));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateWompiPayment: async (order: { id: string }, charge: unknown) => {
    gateway.wompi(order.id, charge);
    return "https://wompi.test/pago";
  },
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []], incr: async () => 1, expire: async () => 1 };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
    incr = client.incr;
    expire = client.expire;
  }
  return { Redis };
});

const WOMPI_EVENTS_KEY = process.env.WOMPI_EVENTS_KEY ?? "test-stub";
const UNIT_PRICE = 16000;
const UNIT_DEPOSIT = 3000;
const TERMS = KNOWN_LEGAL_VERSIONS.terms[KNOWN_LEGAL_VERSIONS.terms.length - 1];

let f: InventoryFixture;
let calendarId = "";
let presaleId = "";

const request = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

function body(extra: Record<string, unknown> = {}, quantity = 1) {
  return {
    fullName: "Clienta Preventa",
    phone: "+573001112233",
    email: "clienta-preventa@prueba.test",
    address: "Calle 1 # 2-3",
    city: "Medellín",
    department: "Antioquia",
    daneCode: "05001000",
    guestId: `guest_${randomUUID().slice(0, 12)}`,
    orderItems: [{ productId: calendarId, quantity }],
    payment: { method: PaymentMethod.Bold },
    shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
    envioClickIdRate: 0,
    subtotal: UNIT_PRICE * quantity,
    total: UNIT_PRICE * quantity,
    preorderTermsAccepted: true,
    preorderTermsVersion: TERMS,
    ...extra,
  };
}

async function checkout(payload: Record<string, unknown>) {
  const { POST } = await import("@/app/api/[storeId]/checkout/route");
  const response = await POST(request(payload), { params: { storeId: f.store.id } });
  await flushBackground();
  return response;
}

async function latestOrder() {
  return testPrisma.order.findFirstOrThrow({
    where: { storeId: f.store.id },
    orderBy: { createdAt: "desc" },
    include: { payments: true, shipping: true, orderItems: true },
  });
}

async function wompiWebhook(reference: string, amount: number) {
  const transaction = { id: `WOMPI-${randomUUID().slice(0, 8)}`, status: "APPROVED", reference, amount_in_cents: Math.round(amount * 100), currency: "COP" };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash("sha256").update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${WOMPI_EVENTS_KEY}`).digest("hex");
  const { POST } = await import("@/app/api/webhook/wompi/route");
  const response = await POST(request({ event: "transaction.updated", data: { transaction }, signature: { properties, checksum }, timestamp }));
  await flushBackground();
  return response;
}

const committedUnits = async () => (await testPrisma.productPresale.findUniqueOrThrow({ where: { id: presaleId } })).committedUnits;

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  calendarId = (
    await testPrisma.product.create({
      data: {
        name: "Calendario de adviento caja",
        slug: `calendario-caja-${randomUUID().slice(0, 8)}`,
        description: "d",
        stock: 0,
        price: UNIT_PRICE,
        acqPrice: 9000,
        sku: `CAL-CAJA-${randomUUID().slice(0, 8)}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: f.component.colorId,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
      },
    })
  ).id;
  presaleId = (
    await testPrisma.productPresale.create({
      data: {
        storeId: f.store.id,
        productId: calendarId,
        status: ProductPresaleStatus.ACTIVE,
        unitLimit: null,
        expectedArrivalAt: null,
        paymentMode: PresalePaymentMode.DEPOSIT,
        depositType: PresaleDepositType.FIXED,
        depositValue: UNIT_DEPOSIT,
        createdBy: "test",
      },
    })
  ).id;
});

beforeEach(async () => {
  session.userId = null;
  gateway.bold.mockClear();
  gateway.wompi.mockClear();
  await testPrisma.productPresale.update({ where: { id: presaleId }, data: { committedUnits: 0 } });
});

afterAll(async () => {
  const ids = (await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } })).map((order) => order.id);
  await testPrisma.inventoryMovement.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.orderInventoryIssue.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderPayment.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentWebhookEvent.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.shipping.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.order.deleteMany({ where: { id: { in: ids } } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.product.deleteMany({ where: { id: calendarId } });
  await deleteInventoryFixture(f);
});

describe("caja de la tienda con preventa con anticipo", () => {
  it("Bold: pedido con anticipo por unidad, envío en cero y un cobro `-A` por el anticipo que firma la pasarela", async () => {
    const response = await checkout(body({}, 2));
    expect(response.status).toBe(200);

    const order = await latestOrder();
    expect(order).toMatchObject({ status: OrderStatus.PENDING, paymentPlan: OrderPaymentPlan.DEPOSIT, depositAmount: UNIT_DEPOSIT * 2, preorderTermsVersion: TERMS, paidAt: null });
    expect(order.total).toBe(UNIT_PRICE * 2);
    expect(order.shipping?.cost ?? 0).toBe(0);
    expect(order.orderItems).toEqual([expect.objectContaining({ productId: calendarId, quantity: 2, isPreorder: true, presaleId })]);
    expect(order.payments).toEqual([
      expect.objectContaining({ kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.PENDING, amount: UNIT_DEPOSIT * 2, gatewayReference: `${order.orderNumber}-A` }),
    ]);
    expect(gateway.bold).toHaveBeenCalledWith(order.id, { reference: `${order.orderNumber}-A`, amount: UNIT_DEPOSIT * 2 });
    expect(await committedUnits()).toBe(0);
  });

  it("transferencia: pedido con anticipo pendiente, sin cobro de pasarela", async () => {
    const response = await checkout(body({ payment: { method: PaymentMethod.BankTransfer } }));
    expect(response.status).toBe(200);
    const order = await latestOrder();
    expect(order).toMatchObject({ status: OrderStatus.PENDING, paymentPlan: OrderPaymentPlan.DEPOSIT, depositAmount: UNIT_DEPOSIT });
    expect(order.payments).toEqual([]);
    expect(gateway.bold).not.toHaveBeenCalled();
  });

  it.each([
    ["con otro producto en el carrito", () => body({ orderItems: [{ productId: calendarId, quantity: 1 }, { productId: f.component.id, quantity: 1 }] }), "sola"],
    ["con cupón", () => body({ couponCode: "BIENVENIDA" }), "cupón"],
    ["con tarjeta de regalo", () => body({ giftCardCode: generateGiftCardCode() }), "tarjeta de regalo"],
    ["contra entrega", () => body({ payment: { method: PaymentMethod.COD } }), "en línea o por transferencia"],
    ["sin aceptar las condiciones", () => body({ preorderTermsAccepted: false }), "condiciones"],
    ["con una versión de condiciones que no existe", () => body({ preorderTermsVersion: "2020-01-01" }), "condiciones"],
  ])("rechaza la caja %s y no crea pedido", async (_label, build, message) => {
    const before = await testPrisma.order.count({ where: { storeId: f.store.id } });
    const response = await checkout(build());
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(message);
    expect(await testPrisma.order.count({ where: { storeId: f.store.id } })).toBe(before);
  });

  it("sin tope, más de 5 por pedido no pasa", async () => {
    const response = await checkout(body({}, 6));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("hasta 5 por pedido");
  });

  it("Bold: reintentar con el anticipo pagado no da enlace", async () => {
    expect((await checkout(body())).status).toBe(200);
    const order = await latestOrder();
    const { POST: retryBold } = await import("@/app/api/[storeId]/bold/checkout/[orderId]/route");
    const retried = await retryBold(request({}), { params: { storeId: f.store.id, orderId: order.id } });
    expect(retried.status).toBe(200);
    expect(await testPrisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);

    const { POST: boldWebhook } = await import("@/app/api/webhook/bold/route");
    const paid = await boldWebhook(
      new Request("http://admin.test/api/webhook/bold", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bold-signature": "firma" },
        body: JSON.stringify({ type: "SALE_APPROVED", data: { metadata: { reference: `${order.orderNumber}-A` }, payment_id: `TX-${order.orderNumber}`, amount: { total: UNIT_DEPOSIT, currency: "COP" } } }),
      }),
    );
    await flushBackground();
    expect(paid.status).toBe(200);
    const afterDeposit = await retryBold(request({}), { params: { storeId: f.store.id, orderId: order.id } });
    expect(afterDeposit.status).toBe(409);
    expect(JSON.stringify(await afterDeposit.json())).toContain("El saldo se cobra cuando llegue el producto");
  });

  it("Wompi: reintentar el pago reutiliza el mismo cobro; con el anticipo pagado ya no hay enlace", async () => {
    expect((await checkout(body({ payment: { method: PaymentMethod.Wompi } }))).status).toBe(200);
    const order = await latestOrder();
    expect(gateway.wompi).toHaveBeenCalledWith(order.id, { reference: `${order.orderNumber}-A`, amount: UNIT_DEPOSIT });

    const { POST: retryWompi } = await import("@/app/api/[storeId]/checkout/[orderId]/route");
    const retried = await retryWompi(request({}), { params: { storeId: f.store.id, orderId: order.id } });
    expect(retried.status).toBe(200);
    expect(gateway.wompi).toHaveBeenLastCalledWith(order.id, { reference: `${order.orderNumber}-A`, amount: UNIT_DEPOSIT });
    expect(await testPrisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);

    expect((await wompiWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT)).status).toBe(200);
    const afterDeposit = await retryWompi(request({}), { params: { storeId: f.store.id, orderId: order.id } });
    expect(afterDeposit.status).toBe(409);
    expect(JSON.stringify(await afterDeposit.json())).toContain("El saldo se cobra cuando llegue el producto");
  });
});

describe("Wompi con la referencia del anticipo", () => {
  it("deja «Anticipo recibido» sin paidAt ni inventario; repetido no suma otra vez", async () => {
    expect((await checkout(body({ payment: { method: PaymentMethod.Wompi } }))).status).toBe(200);
    const order = await latestOrder();

    expect((await wompiWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT)).status).toBe(200);
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
    expect(after).toMatchObject({ status: OrderStatus.DEPOSIT_PAID, paidAt: null });
    expect(after.depositPaidAt).not.toBeNull();
    expect(after.payments).toEqual([expect.objectContaining({ kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED })]);
    expect(await committedUnits()).toBe(1);
    expect(await testPrisma.inventoryMovement.count({ where: { productId: calendarId } })).toBe(0);

    expect((await wompiWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT)).status).toBe(200);
    expect(await committedUnits()).toBe(1);
    expect(await testPrisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("un monto distinto al anticipo no lo da por recibido", async () => {
    expect((await checkout(body({ payment: { method: PaymentMethod.Wompi } }))).status).toBe(200);
    const order = await latestOrder();
    await wompiWebhook(`${order.orderNumber}-A`, UNIT_PRICE);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PENDING);
    expect(await committedUnits()).toBe(0);
  });
});
