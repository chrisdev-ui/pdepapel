import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";
import { recalculateKitStock } from "@/lib/inventory";
import {
  OrderInventoryIssueKind,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@prisma/client";

/**
 * Un pedido puede llegar a «Pagado» aunque alguna línea no se pueda descontar
 * (otra venta se llevó el stock entre el checkout y el pago). Antes eso solo
 * quedaba en la consola; ahora es una fila abierta del pedido que se reintenta
 * o se concilia desde el panel.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({
    users: { getUser: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendOrderEmail: vi.fn().mockResolvedValue(undefined),
  sendShippingEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/shipping-helpers", () => ({
  createGuideForOrder: vi
    .fn()
    .mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }),
}));

const patchRoute = () => import("@/app/api/[storeId]/orders/[orderId]/route");
const issueRoute = () =>
  import("@/app/api/[storeId]/orders/inventory-issues/[issueId]/route");

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const customer = {
  fullName: "Cliente Prueba",
  phone: "+573001234567",
  email: "cliente@prueba.test",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
};

describe("incidencias de inventario de un pedido", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.orderInventoryIssue.deleteMany({
        where: { storeId: fixture.store.id },
      });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const createComponentOrder = (f: InventoryFixture, quantity: number) =>
    testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 10000 * quantity,
        total: 10000 * quantity,
        orderItems: {
          create: [
            {
              productId: f.component.id,
              quantity,
              name: f.component.name,
              price: 10000,
              sku: "COMP",
            },
          ],
        },
        payment: {
          create: { method: PaymentMethod.BankTransfer, storeId: f.store.id },
        },
      },
    });

  const componentStock = async (f: InventoryFixture) =>
    (
      await testPrisma.product.findUniqueOrThrow({
        where: { id: f.component.id },
      })
    ).stock;

  it("registra la línea que no se pudo descontar y la reintenta cuando vuelve el stock", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    // La bodega arranca en 6 y el pedido pide 10: la validación previa de
    // stock la salta el PATCH cuando el pedido ya existe, y el movimiento falla.
    const order = await createComponentOrder(fixture, 10);
    const { PATCH } = await patchRoute();

    const paid = await PATCH(
      json("PATCH", {
        status: OrderStatus.PAID,
        expectedStatus: OrderStatus.PENDING,
        payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(paid.status).toBe(200);
    expect(await componentStock(fixture)).toBe(6);

    const issues = await testPrisma.orderInventoryIssue.findMany({
      where: { orderId: order.id },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: OrderInventoryIssueKind.DECREMENT,
      productId: fixture.component.id,
      quantity: 10,
      orderNumber: order.orderNumber,
      resolvedAt: null,
    });
    expect(issues[0].reason).toContain("Stock insuficiente");

    // Reintentar sin stock vuelve a fallar y la fila sigue abierta.
    const { POST } = await issueRoute();
    const failedRetry = await POST(json("POST", { action: "retry" }), {
      params: { storeId: fixture.store.id, issueId: issues[0].id },
    });
    expect(failedRetry.status).toBeGreaterThanOrEqual(400);
    expect(
      (
        await testPrisma.orderInventoryIssue.findUniqueOrThrow({
          where: { id: issues[0].id },
        })
      ).resolvedAt,
    ).toBeNull();

    // Llega mercancía: el reintento crea el movimiento y enlaza la fila.
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { stock: 12 },
    });
    const retry = await POST(json("POST", { action: "retry" }), {
      params: { storeId: fixture.store.id, issueId: issues[0].id },
    });
    expect(retry.status).toBe(200);
    const resolved = await testPrisma.orderInventoryIssue.findUniqueOrThrow({
      where: { id: issues[0].id },
    });
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedBy).toBe(fixture.store.userId);
    expect(resolved.movementId).toBeTruthy();
    expect(await componentStock(fixture)).toBe(2);
    const movement = await testPrisma.inventoryMovement.findUniqueOrThrow({
      where: { id: resolved.movementId! },
    });
    expect(movement).toMatchObject({
      productId: fixture.component.id,
      quantity: -10,
      referenceId: order.id,
      type: "ORDER_PLACED",
    });
  });

  it("permite conciliar a mano sin mover inventario y rechaza cerrarla dos veces", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await createComponentOrder(fixture, 1);
    const issue = await testPrisma.orderInventoryIssue.create({
      data: {
        storeId: fixture.store.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        kind: OrderInventoryIssueKind.RESTOCK,
        productId: fixture.component.id,
        productName: fixture.component.name,
        quantity: 1,
        reason: "Producto no encontrado",
      },
    });
    const { POST } = await issueRoute();
    const resolved = await POST(json("POST", { action: "resolve" }), {
      params: { storeId: fixture.store.id, issueId: issue.id },
    });
    expect(resolved.status).toBe(200);
    expect(await componentStock(fixture)).toBe(6);
    expect(
      (
        await testPrisma.orderInventoryIssue.findUniqueOrThrow({
          where: { id: issue.id },
        })
      ).resolvedBy,
    ).toBe(fixture.store.userId);

    const again = await POST(json("POST", { action: "resolve" }), {
      params: { storeId: fixture.store.id, issueId: issue.id },
    });
    expect(again.status).toBe(404);

    // Otra tienda no puede tocarla.
    session.userId = "someone-else";
    const foreign = await POST(json("POST", { action: "retry" }), {
      params: { storeId: fixture.store.id, issueId: issue.id },
    });
    expect(foreign.status).toBe(403);
  });

  it("la deuda sobrevive al borrado del pedido con el número guardado", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await createComponentOrder(fixture, 1);
    await testPrisma.orderInventoryIssue.create({
      data: {
        storeId: fixture.store.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        kind: OrderInventoryIssueKind.DECREMENT,
        productId: fixture.component.id,
        productName: fixture.component.name,
        quantity: 1,
        reason: "Stock insuficiente",
      },
    });
    await testPrisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await testPrisma.paymentDetails.deleteMany({
      where: { orderId: order.id },
    });
    await testPrisma.order.delete({ where: { id: order.id } });
    const orphan = await testPrisma.orderInventoryIssue.findFirst({
      where: { storeId: fixture.store.id, orderNumber: order.orderNumber },
    });
    expect(orphan).not.toBeNull();
    expect(orphan?.orderId).toBeNull();
  });
});
