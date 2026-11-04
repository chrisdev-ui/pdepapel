import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, PaymentMethod, StockReservationStatus } from "@prisma/client";

import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { availableStock } from "@/lib/available-stock";
import { assertCapsuleUnitsStayArchived } from "@/lib/capsule-editions";
import { recalculateKitStock } from "@/lib/inventory";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { assertValidKitComponents } from "@/lib/product-kit-conversion";
import { PANEL_ORDER_HOLD_DAYS } from "@/lib/stock-reservations";
import { checkReservationDrift } from "@/lib/stock-reservations-job";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Edición Cyber (2026-11-04): los combos «Cápsula sorpresa Cyber xN» son kits de N unidades de un producto interno
 * archivado («Cápsula Cyber (unidad)», en Kits sorpresa), así todos los canales descuentan de la misma urna. Un pedido
 * pendiente del panel aparta sus cápsulas al crearse; pagar las consume una vez, cancelar las libera.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const cache = vi.hoisted(() => ({ invalidate: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: cache.invalidate,
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: vi.fn(), notifyUnbackedReservations: vi.fn() }));
vi.mock("@/lib/store-access", async (importOriginal) => ({ ...(await importOriginal<object>()), requireStoreOwner: vi.fn().mockResolvedValue("test-user") }));

const CUSTOMER = { fullName: "Clienta del live", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };
const request = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const counters = async (id: string) => {
  const product = await testPrisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedUnits: true } });
  return { ...product, available: availableStock(product) };
};

describe("cápsulas: un solo contador para todos los combos (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let kitIds: string[] = [];

  const setup = async (unitStock = 30) => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const f = fixture;
    await testPrisma.category.upsert({
      where: { id: CAPSULAS_SORPRESA_ID },
      update: {},
      create: { id: CAPSULAS_SORPRESA_ID, name: "Kits sorpresa", slug: `kits-sorpresa-${randomUUID()}`, storeId: f.store.id, typeId: f.category.typeId },
    });
    const base = (name: string, extra: Record<string, unknown>) =>
      testPrisma.product.create({
        data: {
          name,
          slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID()}`,
          description: "Producto de pruebas",
          sku: `CAP-${randomUUID().slice(0, 8)}`,
          storeId: f.store.id,
          categoryId: CAPSULAS_SORPRESA_ID,
          sizeId: f.component.sizeId,
          colorId: f.component.colorId,
          designId: f.component.designId,
          ...extra,
        },
      });
    const unit = await base("Cápsula Cyber (unidad)", { isArchived: true, stock: unitStock, price: 5800, acqPrice: 5107 });
    const x5 = await base("Cápsula sorpresa Cyber x5", { isKit: true, stock: 0, price: 40000, acqPrice: 0 });
    const x7 = await base("Cápsula sorpresa Cyber x7", { isKit: true, stock: 0, price: 49000, acqPrice: 0 });
    await testPrisma.productKit.createMany({ data: [{ kitId: x5.id, componentId: unit.id, quantity: 5 }, { kitId: x7.id, componentId: unit.id, quantity: 7 }] });
    kitIds = [x5.id, x7.id];
    await recalculateKitStock(testPrisma, kitIds);
    return { f, unit, x5, x7 };
  };

  const createOrder = async (storeId: string, items: { productId: string; quantity: number }[], total: number) => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      request("POST", { ...CUSTOMER, type: "STANDARD", salesChannel: "INSTAGRAM", payment: { method: PaymentMethod.BankTransfer }, orderItems: items, subtotal: total, total }),
      { params: { storeId } },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; orderNumber: string };
  };
  const patchOrder = async (storeId: string, orderId: string, body: Record<string, unknown>) => {
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    return PATCH(request("PATCH", { ...CUSTOMER, expectedStatus: OrderStatus.PENDING, ...body }), { params: { storeId, orderId } });
  };

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.productKit.deleteMany({ where: { kitId: { in: kitIds } } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    kitIds = [];
    session.userId = null;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("cada combo muestra floor(unidades / N) de la misma urna", async () => {
    const { unit, x5, x7 } = await setup(30);
    await expect(counters(x5.id)).resolves.toMatchObject({ available: 6 });
    await expect(counters(x7.id)).resolves.toMatchObject({ available: 4 });
    await expect(counters(unit.id)).resolves.toEqual({ stock: 30, reservedUnits: 0, available: 30 });
  });

  it("un pedido pendiente del panel aparta sus cápsulas; pagarlo las descuenta de la unidad una sola vez", async () => {
    const { f, unit, x5, x7 } = await setup(30);
    const order = await createOrder(f.store.id, [{ productId: x5.id, quantity: 1 }], 40000);

    const hold = await testPrisma.stockReservation.findFirstOrThrow({ where: { orderId: order.id } });
    expect(hold.status).toBe(StockReservationStatus.CONVERTED);
    expect(Math.round((hold.expiresAt.getTime() - hold.createdAt.getTime()) / 86_400_000)).toBe(PANEL_ORDER_HOLD_DAYS);
    await expect(counters(unit.id)).resolves.toEqual({ stock: 30, reservedUnits: 5, available: 25 });
    await expect(counters(x5.id)).resolves.toMatchObject({ available: 5 });
    await expect(counters(x7.id)).resolves.toMatchObject({ available: 3 });

    const paid = await patchOrder(f.store.id, order.id, { status: OrderStatus.PAID, payment: { method: PaymentMethod.BankTransfer, transactionId: `REF-${order.id}` } });
    expect(paid.status).toBe(200);
    await expect(counters(unit.id)).resolves.toEqual({ stock: 25, reservedUnits: 0, available: 25 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: hold.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONSUMED });
    const unitMoves = await testPrisma.inventoryMovement.findMany({ where: { productId: unit.id, referenceId: order.id } });
    expect(unitMoves.reduce((sum, move) => sum + move.quantity, 0)).toBe(-5);
    await expect(counters(x7.id)).resolves.toMatchObject({ available: 3 });
    await expect(checkReservationDrift()).resolves.toBe(0);
  });

  it("cancelar un pedido pendiente libera sus cápsulas sin mover el stock", async () => {
    const { f, unit } = await setup(30);
    const x7 = await testPrisma.product.findFirstOrThrow({ where: { storeId: f.store.id, name: "Cápsula sorpresa Cyber x7" } });
    const order = await createOrder(f.store.id, [{ productId: x7.id, quantity: 2 }], 98000);
    await expect(counters(unit.id)).resolves.toEqual({ stock: 30, reservedUnits: 14, available: 16 });

    const cancelled = await patchOrder(f.store.id, order.id, { status: OrderStatus.CANCELLED });
    expect(cancelled.status).toBe(200);
    await expect(counters(unit.id)).resolves.toEqual({ stock: 30, reservedUnits: 0, available: 30 });
    await expect(testPrisma.stockReservation.findFirstOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ status: StockReservationStatus.RELEASED });
    await expect(checkReservationDrift()).resolves.toBe(0);
  });

  it("un pedido sin cápsulas no aparta nada", async () => {
    const { f } = await setup(30);
    const order = await createOrder(f.store.id, [{ productId: f.component.id, quantity: 1 }], 10000);
    await expect(testPrisma.stockReservation.count({ where: { orderId: order.id } })).resolves.toBe(0);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 0 });
  });

  it("el punto de venta vende un combo y descuenta la unidad archivada", async () => {
    const { f, unit, x5 } = await setup(30);
    await createPointOfSaleSale({ storeId: f.store.id, items: [{ productId: x5.id, quantity: 1 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: `pos-${randomUUID()}`, userId: "test-user" });
    await expect(counters(unit.id)).resolves.toMatchObject({ stock: 25 });
    await expect(counters(x5.id)).resolves.toMatchObject({ available: 5 });
  });

  it("«Ajustar» en la unidad recalcula los combos y purga sus fichas", async () => {
    const { f, unit, x5, x7 } = await setup(30);
    const { POST } = await import("@/app/api/[storeId]/inventory/route");
    const response = await POST(request("POST", { productId: unit.id, type: "MANUAL_ADJUSTMENT", action: "add", quantity: 10, reason: "Paula armó más cápsulas" }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(200);
    await expect(counters(unit.id)).resolves.toMatchObject({ stock: 40 });
    await expect(counters(x5.id)).resolves.toMatchObject({ available: 8 });
    await expect(counters(x7.id)).resolves.toMatchObject({ available: 5 });
    const purged = cache.invalidate.mock.calls.map((call) => call[1]?.productIds ?? []).flat();
    expect(purged).toEqual(expect.arrayContaining([unit.id, x5.id, x7.id]));
  });

  it("la unidad archivada sirve de componente solo si es de Kits sorpresa", async () => {
    const { f, unit } = await setup(30);
    await expect(assertValidKitComponents(testPrisma, { storeId: f.store.id, components: [{ componentId: unit.id }] })).resolves.toBeUndefined();
    await testPrisma.product.update({ where: { id: f.component.id }, data: { isArchived: true } });
    await expect(assertValidKitComponents(testPrisma, { storeId: f.store.id, components: [{ componentId: f.component.id }] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("«Restaurar» (masivo o de la ficha) no saca la unidad del archivo", async () => {
    const { f, unit } = await setup(30);
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const response = await POST(request("POST", { field: "isArchived", value: false, productIds: [unit.id] }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(409);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: unit.id } })).resolves.toMatchObject({ isArchived: true });
    await expect(assertCapsuleUnitsStayArchived(testPrisma, [unit.id])).rejects.toMatchObject({ statusCode: 409 });

    // Un producto archivado de Kits sorpresa que no es componente de nada sí se puede restaurar.
    const loose = await testPrisma.product.create({
      data: { name: "Cajita vieja", slug: `cajita-${randomUUID()}`, description: "x", sku: `CAJ-${randomUUID().slice(0, 8)}`, storeId: f.store.id, categoryId: CAPSULAS_SORPRESA_ID, sizeId: f.component.sizeId, colorId: f.component.colorId, designId: f.component.designId, isArchived: true, stock: 1, price: 9000 },
    });
    await expect(assertCapsuleUnitsStayArchived(testPrisma, [loose.id])).resolves.toBeUndefined();
  });
});
