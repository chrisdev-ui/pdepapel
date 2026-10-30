import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PresalePaymentMode,
  ProductPresaleStatus,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";

import { sumPrepaid } from "@/lib/order-payment-amounts";
import { owedPresaleUnits } from "@/lib/presale-owed";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Llegó menos de lo vendido: «Liberar lo que llegó» suelta los pedidos más
 * antiguos que caben y deja los demás «sin unidad». Cancelar un pedido con
 * anticipo exige anotar qué pasó con la plata (devuelto / retenido / saldo a
 * favor), y lo retenido nunca pasa del anticipo ni existe si no hubo unidad.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const unfulfilledEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendPreorderUnfulfilledEmail: unfulfilledEmail }));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWhatsAppTemplateMessage: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: vi.fn(), quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let f: InventoryFixture;
let calendarId = "";
let presaleId = "";
const UNIT_DEPOSIT = 30000;
const UNIT_PRICE = 160000;

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

/** Pedido con anticipo de `units` calendarios, pagado hace `daysAgo` días; con abono opcional. */
async function depositOrder(units: number, daysAgo: number, installment = 0) {
  const paidAt = new Date(Date.now() - daysAgo * 86_400_000);
  const orderNumber = `ORD-PRB-${randomUUID().slice(0, 8)}`;
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber,
      status: OrderStatus.DEPOSIT_PAID,
      paymentPlan: OrderPaymentPlan.DEPOSIT,
      depositAmount: UNIT_DEPOSIT * units,
      depositPaidAt: paidAt,
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      fullName: "Clienta Preventa",
      phone: "+573001112233",
      email: "clienta-preventa@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      daneCode: "05001000",
      subtotal: UNIT_PRICE * units,
      total: UNIT_PRICE * units,
      orderItems: { create: [{ productId: calendarId, name: "Calendario", quantity: units, price: UNIT_PRICE, isPreorder: true, presaleId }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      shipping: { create: { storeId: f.store.id, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, carrierName: "ENVIA" } },
      payments: {
        create: [
          { storeId: f.store.id, kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED, amount: UNIT_DEPOSIT * units, method: PaymentMethod.Bold, paidAt, gatewayReference: `${orderNumber}-A` },
          ...(installment > 0
            ? [{ storeId: f.store.id, kind: OrderPaymentKind.INSTALLMENT, status: OrderPaymentStatus.APPROVED, amount: installment, method: PaymentMethod.BankTransfer, paidAt }]
            : []),
        ],
      },
    },
  });
}

async function patchOrder(orderId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  const response = await PATCH(json("PATCH", body), { params: { storeId: f.store.id, orderId } });
  await flushBackground();
  return response;
}

const linesOf = (orderId: string) => testPrisma.orderItem.findMany({ where: { orderId } });
const paymentsOf = (orderId: string) => testPrisma.orderPayment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

let oldest: { id: string };
let middle: { id: string };
let newest: { id: string };

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  // Llegaron 3 y se vendieron 5: 2 + 2 + 1.
  calendarId = (
    await testPrisma.product.create({
      data: {
        name: "Calendario de adviento",
        slug: `calendario-${randomUUID().slice(0, 8)}`,
        description: "d",
        stock: 3,
        price: UNIT_PRICE,
        acqPrice: 120000,
        sku: `CAL-PRB-${randomUUID().slice(0, 8)}`,
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
        unitLimit: 20,
        committedUnits: 5,
        paymentMode: PresalePaymentMode.DEPOSIT,
        expectedArrivalAt: new Date(Date.now() + 86_400_000),
        createdBy: "test",
      },
    })
  ).id;
  oldest = await depositOrder(2, 5);
  middle = await depositOrder(2, 4, 20000);
  newest = await depositOrder(1, 3);
});

afterAll(async () => {
  const orders = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await testPrisma.inventoryMovement.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.orderPayment.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderInventoryIssue.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.shipping.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.order.deleteMany({ where: { id: { in: ids } } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.product.deleteMany({ where: { id: calendarId } });
  await deleteInventoryFixture(f);
});

describe("Liberar lo que llegó", () => {
  it("la vista previa reparte los pedidos más antiguos que caben, sin partir ninguno", async () => {
    const { getPresaleReleasePreview } = await import("@/lib/presale-release");
    const preview = await getPresaleReleasePreview(f.store.id, presaleId);
    expect(preview.canRelease).toBe(false);
    expect(preview.canReleasePartial).toBe(true);
    // 2 (el más viejo) cabe; 2 (el siguiente) ya no; 1 (el más nuevo) sí.
    expect(preview.partialPlan).toMatchObject({ releaseUnits: 3, unfulfilledUnits: 2, unfulfilledOrderIds: [middle.id] });
    expect(preview.partialPlan.releaseOrderIds.sort()).toEqual([oldest.id, newest.id].sort());
  });

  it("sin confirmar la liberación a medias no libera nada y dice cuánto se puede", async () => {
    const { releasePresale } = await import("@/lib/presale-release");
    await expect(releasePresale({ storeId: f.store.id, presaleId, releasedBy: "user-paula" })).rejects.toThrow(/Puedes liberar 3 con «Liberar lo que llegó»/);
    await expect(
      releasePresale({ storeId: f.store.id, presaleId, releasedBy: "user-paula", partial: true, expectedReleaseUnits: 2 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: calendarId } })).stock).toBe(3);
  });

  it("libera 3, deja 1 pedido «sin unidad» (con su correo) y cierra la campaña", async () => {
    const { POST } = await import("@/app/api/[storeId]/presales/[presaleId]/release/route");
    const response = await POST(
      new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partial: true, expectedReleaseUnits: 3 }) }),
      { params: { storeId: f.store.id, presaleId } },
    );
    while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ releasedUnits: 3, unfulfilledOrderIds: [middle.id], unfulfilledUnits: 2 });
    expect(unfulfilledEmail).toHaveBeenCalledTimes(1);
    expect(unfulfilledEmail).toHaveBeenCalledWith(middle.id);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: calendarId } })).stock).toBe(0);
    expect((await testPrisma.productPresale.findUniqueOrThrow({ where: { id: presaleId } })).status).toBe(ProductPresaleStatus.RELEASED);

    const [middleLine] = await linesOf(middle.id);
    expect(middleLine.preorderReleasedAt).toBeNull();
    expect(middleLine.preorderUnfulfilledAt).not.toBeNull();
    const [oldestLine] = await linesOf(oldest.id);
    expect(oldestLine.preorderReleasedAt).not.toBeNull();
    expect(oldestLine.preorderUnfulfilledAt).toBeNull();
    // Nada queda debiéndose a una preventa cerrada: lo que llegue después se vende normal.
    expect((await owedPresaleUnits(testPrisma, [calendarId])).size).toBe(0);
  });

  it("Pedidos muestra el «sin unidad» en su vista y en «Por atender»", async () => {
    const { listOrderPage, parseOrderListQuery } = await import("@/lib/order-list");
    const sinUnidad = await listOrderPage(testPrisma as never, f.store.id, parseOrderListQuery({ vista: "sin-unidad" }));
    expect(sinUnidad.ids).toEqual([middle.id]);
    expect(sinUnidad.counts["sin-unidad"]).toBe(1);
    const porAtender = await listOrderPage(testPrisma as never, f.store.id, parseOrderListQuery({ vista: "por-atender" }));
    expect(porAtender.ids).toContain(middle.id);
  });
});

describe("cancelar un pedido con anticipo deja escrito qué pasó con la plata", () => {
  it("sin la cuenta de la plata no se cancela", async () => {
    const response = await patchOrder(middle.id, { status: OrderStatus.CANCELLED });
    expect(response.status).toBe(400);
    expect((await response.json()).error ?? "").toMatch(/devuelto, retenido o saldo a favor/);
  });

  it("tiene que sumar lo pagado (anticipo + abono) y no se retiene nada si no hubo unidad", async () => {
    const short = await patchOrder(middle.id, { status: OrderStatus.CANCELLED, settlement: { refunded: 60000, refundMethod: "BankTransfer", refundedAt: new Date().toISOString() } });
    expect(short.status).toBe(400);
    const retained = await patchOrder(middle.id, {
      status: OrderStatus.CANCELLED,
      settlement: { refunded: 20000, refundMethod: "BankTransfer", refundedAt: new Date().toISOString(), retained: 60000 },
    });
    expect(retained.status).toBe(400);
    expect((await response400Text(retained))).toMatch(/no le alcanzó/);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: middle.id } })).status).toBe(OrderStatus.DEPOSIT_PAID);
  });

  it("en bloque y al eliminar se frena: se cancela de a uno, desde el pedido", async () => {
    const { PATCH: bulk } = await import("@/app/api/[storeId]/orders/route");
    const response = await bulk(json("PATCH", { ids: [middle.id], status: OrderStatus.CANCELLED }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(409);
    const { DELETE } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const deleted = await DELETE(json("DELETE"), { params: { storeId: f.store.id, orderId: middle.id } });
    expect(deleted.status).toBe(409);
    expect(await testPrisma.order.count({ where: { id: middle.id } })).toBe(1);
  });

  it("«sin unidad»: devuelve una parte y deja el resto como saldo a favor", async () => {
    const response = await patchOrder(middle.id, {
      status: OrderStatus.CANCELLED,
      settlement: { refunded: 50000, refundMethod: "BankTransfer", refundedAt: new Date().toISOString(), refundReference: "TRX-123", storeCredit: 30000 },
    });
    expect(response.status).toBe(200);
    const payments = await paymentsOf(middle.id);
    expect(payments.filter((p) => p.kind === OrderPaymentKind.REFUND)).toEqual([
      expect.objectContaining({ amount: 50000, method: PaymentMethod.BankTransfer, transactionId: "TRX-123", status: OrderPaymentStatus.APPROVED }),
    ]);
    // El saldo a favor no sale de ningún medio: se anota con el del anticipo.
    expect(payments.filter((p) => p.kind === OrderPaymentKind.STORE_CREDIT)).toEqual([expect.objectContaining({ amount: 30000, method: PaymentMethod.Bold })]);
    // Lo anotado no cuenta como plata recibida.
    expect(sumPrepaid(payments)).toBe(80000);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: middle.id } })).status).toBe(OrderStatus.CANCELLED);
    // Nunca se descontó: cancelar no inventa unidades en bodega.
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: calendarId } })).stock).toBe(0);
  });

  it("con unidad: se retiene hasta el anticipo, nunca más", async () => {
    const tooMuch = await patchOrder(newest.id, { status: OrderStatus.CANCELLED, settlement: { retained: 30001 } });
    expect(tooMuch.status).toBe(400);
    expect(await response400Text(tooMuch)).toMatch(/Solo el anticipo no es reembolsable/);
    const response = await patchOrder(newest.id, { status: OrderStatus.CANCELLED, settlement: { retained: UNIT_DEPOSIT } });
    expect(response.status).toBe(200);
    const payments = await paymentsOf(newest.id);
    expect(payments.filter((p) => p.kind === OrderPaymentKind.RETAINED)).toEqual([expect.objectContaining({ amount: UNIT_DEPOSIT, method: PaymentMethod.Bold })]);
    // Esa unidad sí se había liberado (descontado): vuelve a bodega.
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: calendarId } })).stock).toBe(1);
  });

  it("un anticipo sin fila de pago (anotado antes del historial) también pide la cuenta", async () => {
    const legacy = await depositOrder(1, 2);
    await testPrisma.orderPayment.deleteMany({ where: { orderId: legacy.id } });
    const response = await patchOrder(legacy.id, { status: OrderStatus.CANCELLED });
    expect(response.status).toBe(400);
    const settled = await patchOrder(legacy.id, { status: OrderStatus.CANCELLED, settlement: { refunded: UNIT_DEPOSIT, refundMethod: "CASH", refundedAt: new Date().toISOString() } });
    expect(settled.status).toBe(200);
  });

  it("Preventas suma lo devuelto, lo retenido y el saldo a favor", async () => {
    const { getPresales } = await import("@/app/(dashboard)/[storeId]/(routes)/preventas/server/get-presales");
    const summary = await getPresales(f.store.id);
    const row = summary.rows.find((r) => r.id === presaleId)!;
    // 50.000 del «sin unidad» + 30.000 del anticipo sin fila.
    expect(row).toMatchObject({ refunded: 80000, retained: UNIT_DEPOSIT, storeCredit: 30000, unfulfilledOrders: 0 });
    expect(summary).toMatchObject({ refunded: 80000, retained: UNIT_DEPOSIT, storeCredit: 30000 });
  });
});

async function response400Text(response: Response): Promise<string> {
  const body = await response.json();
  return String(body.error ?? body.message ?? JSON.stringify(body));
}
