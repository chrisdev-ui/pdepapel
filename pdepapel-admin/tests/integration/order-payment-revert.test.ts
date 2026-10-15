import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus, StockReservationStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { checkReservationDrift } from "@/lib/stock-reservations-job";

import { applyOrderPaymentRevert, assertExpectedRows, planOrderPaymentRevert, TRANSACTION_OPTIONS } from "../../scripts/lib/order-payment-revert.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Un contra entrega marcado pagado por error (ORD-1791998787841-915,
 * 2026-10-15): el guion lo devuelve a «Pendiente de pago» sin tocar productos,
 * precios, clienta ni dirección y sin enviar nada; las unidades vuelven al
 * kardex pero quedan apartadas para el pedido, el panel deja crear la guía
 * contra entrega y, cuando la transportadora recoge el paquete, el inventario
 * se descuenta una sola vez.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const sent = vi.hoisted(() => ({ order: vi.fn(), shipping: vi.fn(), resend: vi.fn(), guide: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: sent.order, sendShippingEmail: sent.shipping }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: sent.resend } } }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: sent.guide }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: vi.fn(), notifyUnbackedReservations: vi.fn() }));

const REFERENCE = "1230000";
const CUSTOMER = { fullName: "Clienta contra entrega", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };
const request = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const counters = async (id: string) => {
  const product = await testPrisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedUnits: true } });
  return { ...product, available: availableStock(product) };
};

describe("revertir un pago marcado por error en un contra entrega", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Dos productos sueltos (3 y 2 en bodega) y un pedido contra entrega de la tienda: 1 + 2 unidades. */
  const setup = async () => {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    const product = (name: string, stock: number) =>
      testPrisma.product.create({
        data: {
          name,
          slug: `${name.toLowerCase()}-${randomUUID()}`,
          description: "Producto de pruebas",
          stock,
          price: 8000,
          acqPrice: 3000,
          sku: `TEST-${randomUUID()}`,
          storeId: f.store.id,
          categoryId: f.category.id,
          sizeId: f.component.sizeId,
          colorId: f.component.colorId,
          designId: f.component.designId,
        },
      });
    const pen = await product("Lapicero", 3);
    const notebook = await product("Libreta", 2);
    const order = await testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        source: OrderSource.STORE,
        ...CUSTOMER,
        subtotal: 24000,
        total: 24000,
        orderItems: {
          create: [
            { productId: pen.id, quantity: 1, name: pen.name, price: 8000, sku: pen.sku },
            { productId: notebook.id, quantity: 2, name: notebook.name, price: 8000, sku: notebook.sku },
          ],
        },
        payment: { create: { method: PaymentMethod.COD, storeId: f.store.id } },
        shipping: { create: { storeId: f.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, cost: 0, isCOD: false } },
      },
    });
    return { f, pen, notebook, order, target: { storeId: f.store.id, orderId: order.id, orderNumber: order.orderNumber, reference: REFERENCE } };
  };

  const markPaidByMistake = async (storeId: string, orderId: string) => {
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await PATCH(
      request("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.COD, transactionId: REFERENCE } }),
      { params: { storeId, orderId } },
    );
    expect(response.status).toBe(200);
  };

  const shipVia = async (storeId: string, shippingId: string, status: ShippingStatus) => {
    const { PATCH } = await import("@/app/api/[storeId]/shipments/bulk-update/route");
    const response = await PATCH(request("PATCH", { shipmentIds: [shippingId], status }), { params: { storeId } });
    expect(response.status).toBe(200);
  };

  it("vuelve a pendiente solo el pago, aparta lo devuelto, deja crear la guía contra entrega y el envío descuenta una vez", async () => {
    const { f, pen, notebook, order, target } = await setup();
    await markPaidByMistake(f.store.id, order.id);
    const paid = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { orderItems: { orderBy: { quantity: "asc" } } } });
    expect(paid.paidAt).not.toBeNull();
    expect(paid.netProfit).not.toBeNull();
    await expect(counters(pen.id)).resolves.toEqual({ stock: 2, reservedUnits: 0, available: 2 });
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 0, reservedUnits: 0, available: 0 });
    vi.clearAllMocks();

    const plan = await planOrderPaymentRevert(testPrisma, target);
    expect(plan.problems).toEqual([]);
    assertExpectedRows(plan, 1);
    // Corre desde fuera de Railway: el tope de 5 s de Prisma cortó la primera corrida en producción.
    const transactionOptions: unknown[] = [];
    const recording = new Proxy(testPrisma, {
      get(client, key) {
        if (key !== "$transaction") return Reflect.get(client, key);
        return (run: never, options: unknown) => {
          transactionOptions.push(options);
          return client.$transaction(run, options as never);
        };
      },
    });
    const written = await applyOrderPaymentRevert(recording, plan, target);
    expect(written).toMatchObject({ order: 1, payment: 1, shipping: 1, movements: 2 });
    expect(transactionOptions).toEqual([TRANSACTION_OPTIONS]);
    expect(TRANSACTION_OPTIONS.timeout).toBeGreaterThanOrEqual(30_000);

    // Nada sale: ni correos ni avisos.
    expect(sent.order).not.toHaveBeenCalled();
    expect(sent.shipping).not.toHaveBeenCalled();
    expect(sent.resend).not.toHaveBeenCalled();

    const reverted = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { orderItems: { orderBy: { quantity: "asc" } }, payment: true, shipping: true } });
    expect(reverted).toMatchObject({ status: OrderStatus.PENDING, paidAt: null, totalProductCost: null, gatewayFee: null, shippingCost: null, netProfit: null, profitMarginPct: null, ...CUSTOMER, subtotal: paid.subtotal, total: paid.total });
    expect(reverted.payment).toMatchObject({ method: PaymentMethod.COD, transactionId: null });
    expect(reverted.shipping).toMatchObject({ isCOD: true, status: ShippingStatus.Preparing });
    expect(reverted.orderItems.map(({ productId, quantity, price }) => ({ productId, quantity, price }))).toEqual(
      paid.orderItems.map(({ productId, quantity, price }) => ({ productId, quantity, price })),
    );

    const returns = await testPrisma.inventoryMovement.findMany({ where: { referenceId: order.id, type: "ORDER_CANCELLED" }, orderBy: { quantity: "asc" } });
    expect(returns.map(({ productId, previousStock, newStock }) => ({ productId, previousStock, newStock }))).toEqual([
      { productId: pen.id, previousStock: 2, newStock: 3 },
      { productId: notebook.id, previousStock: 0, newStock: 2 },
    ]);
    expect(returns.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([
      { productId: pen.id, quantity: 1 },
      { productId: notebook.id, quantity: 2 },
    ]);
    // Vuelven a bodega pero no a la venta: lo disponible no cambia.
    await expect(counters(pen.id)).resolves.toEqual({ stock: 3, reservedUnits: 1, available: 2 });
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 2, reservedUnits: 2, available: 0 });
    const hold = await testPrisma.stockReservation.findFirstOrThrow({ where: { orderId: order.id }, include: { items: true } });
    expect(hold).toMatchObject({ status: StockReservationStatus.CONVERTED, customerPhone: CUSTOMER.phone, productId: null, quantity: null });
    expect(hold.items).toHaveLength(2);
    await expect(checkReservationDrift()).resolves.toBe(0);

    // Una segunda corrida no encuentra qué revertir.
    const again = await planOrderPaymentRevert(testPrisma, target);
    expect(again.ok).toBe(false);
    expect(() => assertExpectedRows(again, 1)).toThrow(/no se puede revertir/);

    // Paula guarda el pedido como lo manda el formulario: la reserva sigue igual.
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const saved = await PATCH(
      request("PATCH", { ...CUSTOMER, skipAutoGuide: true, orderItems: [{ productId: pen.id, quantity: 1 }, { productId: notebook.id, quantity: 2 }] }),
      { params: { storeId: f.store.id, orderId: order.id } },
    );
    expect(saved.status).toBe(200);
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 2, reservedUnits: 2, available: 0 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: hold.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONVERTED });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.PENDING });

    // Guía contra entrega con el pedido sin pagar: el panel la deja crear.
    const shipping = reverted.shipping!;
    await testPrisma.shipping.update({ where: { id: shipping.id }, data: { envioClickIdRate: 555, carrierName: "ENVIA", cost: 9000 } });
    sent.guide.mockResolvedValue({ data: { idOrder: 777, tracker: "T-777" } });
    const guideRoute = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    const guide = await guideRoute.POST(request("POST"), { params: { storeId: f.store.id, orderId: order.id } });
    expect(guide.status).toBe(200);
    expect(sent.guide).toHaveBeenCalledWith(order.id, f.store.id);

    // La transportadora recoge: «Enviado» y el inventario baja una sola vez.
    await testPrisma.shipping.update({ where: { id: shipping.id }, data: { envioClickIdOrder: 777, status: ShippingStatus.Shipped } });
    await shipVia(f.store.id, shipping.id, ShippingStatus.PickedUp);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.SENT, paidAt: null });
    await expect(counters(pen.id)).resolves.toEqual({ stock: 2, reservedUnits: 0, available: 2 });
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 0, reservedUnits: 0, available: 0 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: hold.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONSUMED });

    await shipVia(f.store.id, shipping.id, ShippingStatus.InTransit);
    const net = await testPrisma.inventoryMovement.aggregate({ where: { referenceId: order.id }, _sum: { quantity: true } });
    expect(net._sum.quantity).toBe(-3);
    await expect(checkReservationDrift()).resolves.toBe(0);
  });

  it("sin envío contra entrega el panel no deja crear la guía de un pedido pendiente", async () => {
    const { f, order, target } = await setup();
    await markPaidByMistake(f.store.id, order.id);
    const plan = await planOrderPaymentRevert(testPrisma, target);
    await applyOrderPaymentRevert(testPrisma, plan, target);
    const shipping = await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } });
    await testPrisma.shipping.update({ where: { id: shipping.id }, data: { isCOD: false, envioClickIdRate: 555 } });

    const guideRoute = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    const guide = await guideRoute.POST(request("POST"), { params: { storeId: f.store.id, orderId: order.id } });
    expect(guide.status).toBe(400);
    expect((await guide.json()).error).toContain("PAGADA");
    expect(sent.guide).not.toHaveBeenCalled();
  });

  it("con --sin-apartado las unidades vuelven a la venta hasta el envío", async () => {
    const { f, notebook, order, target } = await setup();
    await markPaidByMistake(f.store.id, order.id);
    const plan = await planOrderPaymentRevert(testPrisma, target);
    const written = await applyOrderPaymentRevert(testPrisma, plan, target, { hold: false });
    expect(written.reservation).toBeNull();
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 2, reservedUnits: 0, available: 2 });
    await expect(testPrisma.stockReservation.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });

  it("se niega con otra referencia, otro método o una guía ya creada, sin escribir", async () => {
    const { f, order, target } = await setup();
    await markPaidByMistake(f.store.id, order.id);
    const wrongReference = await planOrderPaymentRevert(testPrisma, { ...target, reference: "999" });
    expect(wrongReference.problems).toContain("la referencia de pago no es la esperada");

    await testPrisma.shipping.updateMany({ where: { orderId: order.id }, data: { envioClickIdOrder: 1 } });
    const withGuide = await planOrderPaymentRevert(testPrisma, target);
    expect(withGuide.ok).toBe(false);
    expect(() => assertExpectedRows(withGuide, 1)).toThrow(/ya tiene guía/);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.PAID });
  });
});

describe("un contra entrega sin cobrar que la transportadora recoge", () => {
  let fixture: InventoryFixture | undefined;

  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
  });

  it("pasa a «Enviado» y descuenta su inventario una sola vez; una transferencia sin pagar no", async () => {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    const product = await testPrisma.product.create({
      data: { name: "Cuaderno", slug: `cuaderno-${randomUUID()}`, description: "Producto de pruebas", stock: 5, price: 9000, acqPrice: 4000, sku: `TEST-${randomUUID()}`, storeId: f.store.id, categoryId: f.category.id, sizeId: f.component.sizeId, colorId: f.component.colorId, designId: f.component.designId },
    });
    const pendingOrder = (method: PaymentMethod) =>
      testPrisma.order.create({
        data: {
          storeId: f.store.id,
          orderNumber: `ORD-TEST-${randomUUID()}`,
          status: OrderStatus.PENDING,
          type: OrderType.STANDARD,
          ...CUSTOMER,
          subtotal: 18000,
          total: 18000,
          orderItems: { create: [{ productId: product.id, quantity: 2, name: product.name, price: 9000, sku: product.sku }] },
          payment: { create: { method, storeId: f.store.id } },
          shipping: { create: { storeId: f.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Shipped, cost: 0, isCOD: method === PaymentMethod.COD, envioClickIdOrder: 9 } },
        },
        include: { shipping: true },
      });
    const cod = await pendingOrder(PaymentMethod.COD);
    const transfer = await pendingOrder(PaymentMethod.BankTransfer);
    const { PATCH } = await import("@/app/api/[storeId]/shipments/bulk-update/route");
    const ship = (status: ShippingStatus) =>
      PATCH(request("PATCH", { shipmentIds: [cod.shipping!.id, transfer.shipping!.id], status }), { params: { storeId: f.store.id } });

    expect((await ship(ShippingStatus.PickedUp)).status).toBe(200);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: cod.id } })).resolves.toMatchObject({ status: OrderStatus.SENT, paidAt: null });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: transfer.id } })).resolves.toMatchObject({ status: OrderStatus.PENDING });
    await expect(counters(product.id)).resolves.toMatchObject({ stock: 3 });
    const placed = await testPrisma.inventoryMovement.findMany({ where: { referenceId: cod.id, type: "ORDER_PLACED" } });
    expect(placed.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([{ productId: product.id, quantity: -2 }]);

    expect((await ship(ShippingStatus.InTransit)).status).toBe(200);
    await expect(counters(product.id)).resolves.toMatchObject({ stock: 3 });
    await expect(testPrisma.inventoryMovement.count({ where: { referenceId: { in: [cod.id, transfer.id] } } })).resolves.toBe(1);
  });
});
