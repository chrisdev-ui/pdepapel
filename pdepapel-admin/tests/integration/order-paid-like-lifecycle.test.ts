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
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";

/**
 * Un pedido «Enviado» ya descontó su inventario: PAID y SENT son el mismo
 * estado a efectos de stock (`PAID_LIKE_STATUSES`). Lo que cambia de uno a
 * otro es dónde está la mercancía, no si salió de bodega.
 *
 * Estas pruebas fijan las cuatro esquinas de esa regla, porque el código las
 * decidía con `status === PAID` literal en cuatro sitios distintos.
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
const collectionRoute = () => import("@/app/api/[storeId]/orders/route");

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

describe("ciclo de vida de un pedido pagado o enviado", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Un pedido de 1 kit = 2 unidades del componente. La bodega arranca en 6. */
  const createKitOrder = async (
    f: InventoryFixture,
    extra: Record<string, unknown> = {},
  ) =>
    testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 10000,
        total: 10000,
        orderItems: {
          create: [
            {
              productId: f.kit.id,
              quantity: 1,
              name: f.kit.name,
              price: 10000,
              sku: "KIT",
            },
          ],
        },
        payment: {
          create: { method: PaymentMethod.BankTransfer, storeId: f.store.id },
        },
        ...extra,
      },
    });

  const componentStock = async (f: InventoryFixture) =>
    (
      await testPrisma.product.findUniqueOrThrow({
        where: { id: f.component.id },
      })
    ).stock;

  it("marcar como enviado no devuelve el inventario", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture);
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
    expect(await componentStock(fixture)).toBe(4);

    // Enviar no mueve mercancía: ya salió de bodega al cobrarse.
    const sent = await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PAID,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(sent.status).toBe(200);
    expect(await componentStock(fixture)).toBe(4);

    const returns = await testPrisma.inventoryMovement.findMany({
      where: { referenceId: order.id, type: "ORDER_CANCELLED" },
    });
    expect(returns).toHaveLength(0);
  });

  it("marcar como enviado deja el envío «en camino» aunque la petición no traiga envío", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture, {
      status: OrderStatus.PAID,
      shipping: {
        create: {
          storeId: fixture.store.id,
          provider: ShippingProvider.MANUAL,
          status: ShippingStatus.Preparing,
          cost: 0,
        },
      },
    });
    const { PATCH } = await patchRoute();

    // El diálogo «Marcar como enviado» de un domiciliario: sin guía y sin
    // bloque de envío en el cuerpo.
    const sent = await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PAID,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(sent.status).toBe(200);
    const after = await testPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { shipping: true },
    });
    expect(after.status).toBe(OrderStatus.SENT);
    expect(after.shipping?.status).toBe(ShippingStatus.Shipped);
  });

  it("poner el envío en camino desde el formulario deja el pedido pagado como «Enviado»", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture, {
      status: OrderStatus.PAID,
      shipping: {
        create: {
          storeId: fixture.store.id,
          provider: ShippingProvider.MANUAL,
          status: ShippingStatus.Preparing,
          cost: 0,
        },
      },
    });
    const { PATCH } = await patchRoute();

    const saved = await PATCH(
      json("PATCH", {
        expectedStatus: OrderStatus.PAID,
        shippingProvider: ShippingProvider.MANUAL,
        shipping: { status: ShippingStatus.Shipped, cost: 0, courier: "Domiciliario" },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(saved.status).toBe(200);
    const after = await testPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { shipping: true },
    });
    expect(after.status).toBe(OrderStatus.SENT);
    expect(after.shipping?.status).toBe(ShippingStatus.Shipped);
    // Enviar no mueve mercancía: ya salió de bodega al cobrarse... y aquí
    // nunca se descontó porque el pedido nació pagado en la fixture.
    const movements = await testPrisma.inventoryMovement.findMany({
      where: { referenceId: order.id },
    });
    expect(movements).toHaveLength(0);
  });

  it("cancelar un pedido ya enviado devuelve el inventario", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture);
    const { PATCH } = await patchRoute();

    await PATCH(
      json("PATCH", {
        status: OrderStatus.PAID,
        expectedStatus: OrderStatus.PENDING,
        payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PAID,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(await componentStock(fixture)).toBe(4);

    const cancelled = await PATCH(
      json("PATCH", {
        status: OrderStatus.CANCELLED,
        expectedStatus: OrderStatus.SENT,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(cancelled.status).toBe(200);
    expect(await componentStock(fixture)).toBe(6);
  });

  it("eliminar un pedido enviado devuelve el inventario", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture);
    const { PATCH, DELETE } = await patchRoute();

    await PATCH(
      json("PATCH", {
        status: OrderStatus.PAID,
        expectedStatus: OrderStatus.PENDING,
        payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PAID,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(await componentStock(fixture)).toBe(4);

    const removed = await DELETE(json("DELETE", {}), {
      params: { storeId: fixture.store.id, orderId: order.id },
    });
    expect(removed.status).toBe(200);
    expect(await componentStock(fixture)).toBe(6);
  });

  it("un pedido contra entrega descuenta al enviarse, no al cobrarse", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture);
    await testPrisma.paymentDetails.updateMany({
      where: { orderId: order.id },
      data: { method: PaymentMethod.COD },
    });
    const { PATCH } = await patchRoute();

    // La mercancía sale de bodega cuando se despacha, aunque no se haya cobrado.
    const sent = await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PENDING,
        payment: { method: PaymentMethod.COD },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(sent.status).toBe(200);
    expect(await componentStock(fixture)).toBe(4);
    const afterSend = await testPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(afterSend.paidAt).toBeNull();

    // Cobrar al entregar no vuelve a descontar.
    const collected = await PATCH(
      json("PATCH", {
        status: OrderStatus.PAID,
        expectedStatus: OrderStatus.SENT,
        payment: { method: PaymentMethod.COD },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(collected.status).toBe(200);
    expect(await componentStock(fixture)).toBe(4);
    const afterCollect = await testPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(afterCollect.paidAt).not.toBeNull();
  });

  it("la cancelación en lote también devuelve el inventario de un enviado", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const order = await createKitOrder(fixture);
    const { PATCH } = await patchRoute();
    await PATCH(
      json("PATCH", {
        status: OrderStatus.PAID,
        expectedStatus: OrderStatus.PENDING,
        payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" },
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    await PATCH(
      json("PATCH", {
        status: OrderStatus.SENT,
        expectedStatus: OrderStatus.PAID,
      }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(await componentStock(fixture)).toBe(4);

    const { PATCH: BULK } = await collectionRoute();
    const cancelled = await BULK(
      json("PATCH", { ids: [order.id], status: OrderStatus.CANCELLED }),
      { params: { storeId: fixture.store.id } },
    );
    expect(cancelled.status).toBe(200);
    expect(await componentStock(fixture)).toBe(6);
  });
});
