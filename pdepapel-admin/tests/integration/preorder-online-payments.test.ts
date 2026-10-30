import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PresaleDepositType,
  PresalePaymentMode,
  ProductPresaleStatus,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";

import { sumPrepaid } from "@/lib/order-payment-amounts";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Lote 2: abonar y pagar el saldo desde `/pedido`. Cada cobro nace PENDING
 * con su referencia `<orderNumber>-P<n>`; el webhook (firmado de verdad) lo
 * resuelve a esa fila, revisa el valor y lo aprueba una sola vez. El saldo
 * pagado con la preventa liberada y el saldo pedido deja el pedido PAGADO.
 * La conciliación de cada hora encuentra el cobro cuyo webhook no llegó.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const mocks = vi.hoisted(() => ({ sendOrderEmail: vi.fn(), purchase: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendOrderEmail: mocks.sendOrderEmail, sendPaymentDeclinedEmail: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordPaidOrderInGoogleAnalytics: mocks.purchase,
  recordDepositInGoogleAnalytics: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/bold", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bold")>()),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
  getBoldConfig: () => ({ identityKey: "identity", secretKey: "secret" }),
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
const PRICE = 160000;
const DEPOSIT = 30000;

let f: InventoryFixture;
let productId = "";
let presaleId = "";
let orderId = "";
let orderNumber = "";

const request = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

async function pay(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/[storeId]/checkout/[orderId]/preorder-payment/route");
  const response = await POST(request(body), { params: { storeId: f.store.id, orderId } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function wompiEvent(reference: string, amount: number, status = "APPROVED", id = `WOMPI-${randomUUID().slice(0, 8)}`) {
  const transaction = { id, status, reference, amount_in_cents: Math.round(amount * 100), currency: "COP" };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash("sha256").update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${WOMPI_EVENTS_KEY}`).digest("hex");
  const { POST } = await import("@/app/api/webhook/wompi/route");
  const response = await POST(request({ event: "transaction.updated", data: { transaction }, signature: { properties, checksum }, timestamp }));
  await flushBackground();
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function boldEvent(reference: string, total: number, type = "SALE_APPROVED") {
  const { POST } = await import("@/app/api/webhook/bold/route");
  const response = await POST(
    new Request("http://admin.test/api/webhook/bold", {
      method: "POST",
      headers: { "content-type": "application/json", "x-bold-signature": "firma" },
      body: JSON.stringify({ type, data: { metadata: { reference }, payment_id: `TX-${reference}`, amount: { total, currency: "COP" } } }),
    }),
  );
  await flushBackground();
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const rows = () => testPrisma.orderPayment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const order = () => testPrisma.order.findUniqueOrThrow({ where: { id: orderId } });

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  productId = (
    await testPrisma.product.create({
      data: {
        storeId: f.store.id,
        name: "Calendario en línea",
        slug: `calendario-en-linea-${randomUUID().slice(0, 8)}`,
        description: "d",
        stock: 0,
        price: PRICE,
        acqPrice: 120000,
        sku: `CAL-LIN-${randomUUID().slice(0, 8)}`,
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
        productId,
        status: ProductPresaleStatus.ACTIVE,
        unitLimit: null,
        committedUnits: 1,
        paymentMode: PresalePaymentMode.DEPOSIT,
        depositType: PresaleDepositType.FIXED,
        depositValue: DEPOSIT,
        createdBy: "test",
      },
    })
  ).id;
  orderNumber = `ORD-LIN-${randomUUID().slice(0, 8)}`;
  orderId = (
    await testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber,
        status: OrderStatus.DEPOSIT_PAID,
        type: OrderType.STANDARD,
        source: OrderSource.STORE,
        paymentPlan: OrderPaymentPlan.DEPOSIT,
        depositAmount: DEPOSIT,
        depositPaidAt: new Date(),
        fullName: "Clienta en línea",
        phone: "+573001112233",
        email: "clienta-linea@prueba.test",
        address: "Calle 1 # 2-3",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        subtotal: PRICE,
        total: PRICE,
        orderItems: { create: [{ productId, name: "Calendario en línea", quantity: 1, price: PRICE, isPreorder: true, presaleId }] },
        payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
        shipping: { create: { storeId: f.store.id, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, cost: 0 } },
        payments: {
          create: [{ storeId: f.store.id, kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED, amount: DEPOSIT, method: PaymentMethod.Bold, paidAt: new Date(), gatewayReference: `${orderNumber}-A` }],
        },
      },
    })
  ).id;
});

afterAll(async () => {
  await testPrisma.paymentWebhookEvent.deleteMany({ where: { orderId } });
  await testPrisma.orderNotification.deleteMany({ where: { orderId } });
  await testPrisma.orderPayment.deleteMany({ where: { orderId } });
  await testPrisma.orderItem.deleteMany({ where: { orderId } });
  await testPrisma.shipping.deleteMany({ where: { orderId } });
  await testPrisma.paymentDetails.deleteMany({ where: { orderId } });
  await testPrisma.order.deleteMany({ where: { id: orderId } });
  await testPrisma.inventoryMovement.deleteMany({ where: { productId } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.product.deleteMany({ where: { id: productId } });
  await deleteInventoryFixture(f);
});

describe("abonar en línea mientras la preventa espera", () => {
  it("las reglas se deciden en el servidor: mínimo, tope y nada de saldo todavía", async () => {
    expect((await pay({ mode: "installment", amount: 9999, method: "Wompi" })).body.error).toMatch(/mínimo es \$ 10\.000/);
    expect((await pay({ mode: "installment", amount: 130001, method: "Wompi" })).body.error).toMatch(/Falta \$ 130\.000/);
    expect((await pay({ mode: "installment", amount: 15000.5, method: "Wompi" })).status).toBe(400);
    expect((await pay({ mode: "balance", amount: 130000, method: "Wompi" })).body.error).toMatch(/cuando llegue el producto/);
    expect((await pay({ mode: "installment", amount: 20000, method: "PayU" })).status).toBe(400);
    expect(await testPrisma.orderPayment.count({ where: { orderId, status: OrderPaymentStatus.PENDING } })).toBe(0);
  });

  it("Wompi: un cobro -P1 propio, reutilizado si la clienta vuelve a pulsar, con el regreso marcado", async () => {
    const first = await pay({ mode: "installment", amount: 20000, method: "Wompi" });
    expect(first.status).toBe(200);
    expect(first.body.reference).toBe(`${orderNumber}-P1`);
    expect(String(first.body.url)).toContain("amount-in-cents=2000000");
    expect(String(first.body.url)).toContain(`reference=${encodeURIComponent(`${orderNumber}-P1`)}`);
    expect(decodeURIComponent(String(first.body.url))).toContain(`/pedido/${orderId}?pago=${orderNumber}-P1`);
    const again = await pay({ mode: "installment", amount: 20000, method: "Wompi" });
    expect(again.body.reference).toBe(`${orderNumber}-P1`);
    const pending = (await rows()).filter((row) => row.status === OrderPaymentStatus.PENDING);
    expect(pending.map((row) => `${row.kind}:${row.amount}:${row.method}`)).toEqual(["INSTALLMENT:20000:Wompi"]);
  });

  it("el webhook aprueba la fila una sola vez; repetirlo no suma; el pedido sigue con anticipo", async () => {
    const event = await wompiEvent(`${orderNumber}-P1`, 20000, "APPROVED", "WOMPI-P1");
    expect(event.status).toBe(200);
    expect(event.body.success).toBe(true);
    const replay = await wompiEvent(`${orderNumber}-P1`, 20000, "APPROVED", "WOMPI-P1");
    expect(replay.status).toBe(200);
    expect(String(replay.body.message)).toMatch(/ya estaba registrado/);
    const all = await rows();
    expect(sumPrepaid(all)).toBe(50000);
    expect(all.find((row) => row.gatewayReference === `${orderNumber}-P1`)).toMatchObject({ status: "APPROVED", transactionId: "WOMPI-P1", createdBy: "SYSTEM_WOMPI" });
    expect((await order()).status).toBe(OrderStatus.DEPOSIT_PAID);
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(orderId, OrderStatus.DEPOSIT_PAID, { installmentAmount: 20000 });
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1);
    // El pago lo hizo con Wompi aunque el anticipo fue con Bold: el pedido no cambia de pasarela.
    expect((await testPrisma.paymentDetails.findUniqueOrThrow({ where: { orderId } })).method).toBe(PaymentMethod.Bold);
  });

  it("un valor distinto en la pasarela no aprueba nada", async () => {
    const charge = await pay({ mode: "installment", amount: 10000, method: "Wompi" });
    expect(charge.body.reference).toBe(`${orderNumber}-P2`);
    const wrong = await wompiEvent(`${orderNumber}-P2`, 1000);
    expect(wrong.status).toBe(400);
    expect((await rows()).find((row) => row.gatewayReference === `${orderNumber}-P2`)?.status).toBe(OrderPaymentStatus.PENDING);
  });

  it("la conciliación encuentra el abono cuyo webhook no llegó (sin tocar el pedido como pago completo)", async () => {
    await testPrisma.orderPayment.updateMany({ where: { gatewayReference: `${orderNumber}-P2` }, data: { createdAt: new Date(Date.now() - 30 * 60 * 1000) } });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("wompi") && url.includes(encodeURIComponent(`${orderNumber}-P2`))) {
        return new Response(JSON.stringify({ data: [{ id: "WOMPI-P2", status: "APPROVED", reference: `${orderNumber}-P2`, amount_in_cents: 1000000, currency: "COP" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const { runPaymentReconciliation } = await import("@/lib/payment-reconciliation");
    const summary = await runPaymentReconciliation({ fetch: fetchMock as unknown as typeof fetch, wompi: { baseUrl: "https://sandbox.wompi.co/v1", privateKey: "prv_test" }, bold: { identityKey: "identity" }, alerts: { enabled: false } });
    await flushBackground();
    expect(summary.paid).toBeGreaterThanOrEqual(1);
    expect((await rows()).find((row) => row.gatewayReference === `${orderNumber}-P2`)).toMatchObject({ status: "APPROVED", transactionId: "WOMPI-P2" });
    expect(sumPrepaid(await rows())).toBe(60000);
    expect((await order()).status).toBe(OrderStatus.DEPOSIT_PAID);
  });
});

describe("pagar el saldo en línea cuando llega", () => {
  it("liberada pero sin el saldo pedido: todavía no se cobra", async () => {
    await testPrisma.product.update({ where: { id: productId }, data: { stock: 1 } });
    const { releasePresale } = await import("@/lib/presale-release");
    await releasePresale({ storeId: f.store.id, presaleId, releasedBy: "test" });
    const early = await pay({ mode: "balance", amount: 100000, method: "Bold" });
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/estamos cotizando el envío/);
    expect((await pay({ mode: "installment", amount: 10000, method: "Wompi" })).status).toBe(400);
  });

  it("con el saldo pedido: solo el valor exacto (producto + envío − pagado) y por Bold con su firma", async () => {
    await testPrisma.order.update({ where: { id: orderId }, data: { balanceRequestedAt: new Date(), total: PRICE + 12000 } });
    await testPrisma.shipping.update({ where: { orderId }, data: { cost: 12000 } });
    expect((await pay({ mode: "balance", amount: 100000, method: "Bold" })).body.error).toMatch(/El saldo es \$ 112\.000/);
    const balance = await pay({ mode: "balance", amount: 112000, method: "Bold" });
    expect(balance.status).toBe(200);
    expect(balance.body).toMatchObject({ reference: `${orderNumber}-P3`, orderNumber: `${orderNumber}-P3`, amount: 112000, currency: "COP" });
    expect(String(balance.body.integritySignature)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(balance.body.redirectionUrl)).toContain(`?pago=${encodeURIComponent(`${orderNumber}-P3`)}`);
  });

  it("el webhook de Bold del saldo deja el pedido PAGADO, una vez, con la compra en GA4 y el correo de saldo", async () => {
    mocks.sendOrderEmail.mockClear();
    const paid = await boldEvent(`${orderNumber}-P3`, 112000);
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ success: true, completed: true });
    const after = await order();
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.paidAt).not.toBeNull();
    expect(after.total).toBe(PRICE + 12000);
    expect(mocks.purchase).toHaveBeenCalledWith(orderId);
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(orderId, OrderStatus.PAID);
    const replay = await boldEvent(`${orderNumber}-P3`, 112000);
    expect(String(replay.body.message)).toMatch(/ya estaba registrado/);
    expect((await rows()).filter((row) => row.kind === OrderPaymentKind.BALANCE && row.status === OrderPaymentStatus.APPROVED)).toHaveLength(1);
    expect(sumPrepaid(await rows())).toBe(60000);
  });

  it("una anulación de un cobro ya aprobado no mueve nada (solo aviso)", async () => {
    const voided = await boldEvent(`${orderNumber}-P3`, 112000, "VOID_APPROVED");
    expect(voided.status).toBe(200);
    expect((await order()).status).toBe(OrderStatus.PAID);
    expect((await rows()).find((row) => row.gatewayReference === `${orderNumber}-P3`)?.status).toBe(OrderPaymentStatus.APPROVED);
  });

  it("un pedido pagado ya no recibe cobros en línea", async () => {
    expect((await pay({ mode: "balance", amount: 0, method: "Bold" })).status).toBe(400);
  });
});
