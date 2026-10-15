import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, PaymentMethod, StockReservationStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import {
  addReservationItem,
  convertReservation,
  createReservation,
  editReservationCustomer,
  extendReservation,
  getReservationDetail,
  setReservationItemQuantity,
} from "@/lib/stock-reservations";
import { checkReservationDrift, sendDailyDigest } from "@/lib/stock-reservations-job";
import { flagUnbackedReservations } from "@/lib/stock-review";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Reservas v2 contra MySQL: varios productos por reserva, todo o nada al
 * crear, agregar / cambiar / quitar con la guarda del contador, un solo
 * pedido con una línea por producto, el pedido como único editor de una
 * reserva convertida, «sin respaldo» por producto, el historial y el
 * resumen con «Vencen mañana».
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const mail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: vi.fn(), notifyUnbackedReservations: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mail.send } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: vi.fn().mockResolvedValue(["paula@prueba.test"]) }));

const DAY = 86_400_000;
/** Lo que el pedido necesita para quedar activo; la reserva solo trae nombre y celular. */
const CUSTOMER = { fullName: "Clienta del grupo", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };
const request = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const counters = async (id: string) => {
  const product = await testPrisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedUnits: true } });
  return { ...product, available: availableStock(product) };
};

describe("reservas v2: varios productos (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  /** Componente (stock 6), kit (2 componentes) y una libreta con el stock pedido. */
  const setup = async (notebookStock = 2) => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const notebook = await testPrisma.product.create({
      data: {
        name: "Libreta",
        slug: `libreta-${randomUUID()}`,
        description: "Producto de pruebas",
        stock: notebookStock,
        price: 8000,
        acqPrice: 3000,
        sku: `TEST-LIB-${randomUUID().slice(0, 8)}`,
        storeId: fixture.store.id,
        categoryId: fixture.category.id,
        sizeId: fixture.component.sizeId,
        colorId: fixture.component.colorId,
        designId: fixture.component.designId,
      },
    });
    return { f: fixture, notebook };
  };
  const owner = () => fixture!.store.userId;
  const create = (items: { productId: string; quantity: number }[], extra: { days?: number } = {}) =>
    createReservation({ storeId: fixture!.store.id, items, customerName: "Clienta del grupo", customerPhone: "3001234567", days: extra.days, createdBy: owner() });

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.jobRun.deleteMany({ where: { name: "stock-reservations" } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("crear con varios productos aparta todo o nada; el 409 nombra cada producto que no alcanza", async () => {
    const { f, notebook } = await setup(1);

    const one = await create([{ productId: f.component.id, quantity: 2 }, { productId: notebook.id, quantity: 2 }]).catch((error) => error);
    expect(one).toMatchObject({ statusCode: 409, message: "Solo queda 1 unidad disponible de «Libreta» y pediste 2." });

    const both = await create([{ productId: f.component.id, quantity: 9 }, { productId: notebook.id, quantity: 2 }]).catch((error) => error);
    expect(both.statusCode).toBe(409);
    expect(both.message).toBe("No alcanza para reservar: «Componente» (quedan 6, pediste 9); «Libreta» (quedan 1, pediste 2).");
    expect(both.details.short).toHaveLength(2);

    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 0 });
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 0 });
    await expect(testPrisma.stockReservation.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
  });

  it("crear con varios productos: un ítem por producto (el repetido se suma), encabezado sin producto e historial", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([
      { productId: f.component.id, quantity: 1 },
      { productId: notebook.id, quantity: 1 },
      { productId: f.component.id, quantity: 2 },
    ]);

    expect(reservation).toMatchObject({ productId: null, quantity: null, status: StockReservationStatus.ACTIVE });
    expect(reservation.items.map((item) => [item.productId, item.quantity])).toEqual([
      [f.component.id, 3],
      [notebook.id, 1],
    ]);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 3, available: 3 });
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 1, available: 1 });

    const { events } = await getReservationDetail(f.store.id, reservation.id);
    expect(events.map((event) => event.kind).sort()).toEqual(["created", "item_added", "item_added"]);
    expect(events.every((event) => event.actor === owner())).toBe(true);
    expect(JSON.stringify(events)).not.toContain("Clienta del grupo");
    expect(JSON.stringify(events)).not.toContain("3001234567");
  });

  it("agregar a la reserva abierta suma o crea el ítem, con la guarda; el vencimiento no se mueve", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.component.id, quantity: 1 }], { days: 3 });

    const more = await addReservationItem(f.store.id, reservation.id, { productId: f.component.id, quantity: 2 }, owner());
    expect(more.reservation.items).toMatchObject([{ productId: f.component.id, quantity: 3 }]);
    expect(more.reservation).toMatchObject({ productId: f.component.id, quantity: 3 });

    const other = await addReservationItem(f.store.id, reservation.id, { productId: notebook.id, quantity: 2 }, owner());
    expect(other.reservation.items.map((item) => [item.productId, item.quantity])).toEqual([
      [f.component.id, 3],
      [notebook.id, 2],
    ]);
    expect(other.reservation).toMatchObject({ productId: null, quantity: null });
    expect(other.reservation.expiresAt.getTime()).toBe(reservation.expiresAt.getTime());

    await expect(addReservationItem(f.store.id, reservation.id, { productId: notebook.id, quantity: 1 }, owner())).rejects.toMatchObject({ statusCode: 409 });
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 2, available: 0 });
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 3 });
  });

  it("dos «agregar» a la vez por la última unidad: uno gana y el contador queda exacto", async () => {
    const { f, notebook } = await setup(1);
    const { reservation } = await create([{ productId: f.component.id, quantity: 1 }]);
    const results = await Promise.allSettled([
      addReservationItem(f.store.id, reservation.id, { productId: notebook.id, quantity: 1 }, owner()),
      addReservationItem(f.store.id, reservation.id, { productId: notebook.id, quantity: 1 }, owner()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 1, available: 0 });
    await expect(testPrisma.stockReservationItem.findMany({ where: { reservationId: reservation.id, productId: notebook.id }, select: { quantity: true } })).resolves.toEqual([{ quantity: 1 }]);
  });

  it("cambiar la cantidad aparta o libera la diferencia; quitar el último producto libera la reserva", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.component.id, quantity: 2 }, { productId: notebook.id, quantity: 1 }]);
    const itemOf = (productId: string) => reservation.items.find((item) => item.productId === productId)!.id;

    await setReservationItemQuantity(f.store.id, reservation.id, { itemId: itemOf(f.component.id), quantity: 5 }, owner());
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 5 });
    await expect(setReservationItemQuantity(f.store.id, reservation.id, { itemId: itemOf(f.component.id), quantity: 7 }, owner())).rejects.toMatchObject({ statusCode: 409 });
    await setReservationItemQuantity(f.store.id, reservation.id, { itemId: itemOf(f.component.id), quantity: 1 }, owner());
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 1 });

    const removed = await setReservationItemQuantity(f.store.id, reservation.id, { itemId: itemOf(notebook.id), quantity: 0 }, owner());
    expect(removed.released).toBe(false);
    expect(removed.reservation).toMatchObject({ productId: f.component.id, quantity: 1 });
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 0 });

    const last = await setReservationItemQuantity(f.store.id, reservation.id, { itemId: itemOf(f.component.id), quantity: 0 }, owner());
    expect(last.released).toBe(true);
    expect(last.reservation.status).toBe(StockReservationStatus.RELEASED);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 0 });

    const { events } = await getReservationDetail(f.store.id, reservation.id);
    expect(events.map((event) => event.kind)).toEqual(expect.arrayContaining(["item_quantity", "item_removed", "released"]));
    await expect(checkReservationDrift()).resolves.toBe(0);
  });

  it("un kit dentro de una reserva de varios productos aparta sus piezas y su receta queda protegida", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.kit.id, quantity: 1 }, { productId: notebook.id, quantity: 1 }]);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 2 });
    expect(reservation.productId).toBeNull();

    const kit = await testPrisma.product.findUniqueOrThrow({ where: { id: f.kit.id } });
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const response = await PATCH(
      request("PATCH", {
        name: kit.name,
        price: kit.price,
        acqPrice: kit.acqPrice,
        categoryId: kit.categoryId,
        sizeId: kit.sizeId,
        colorId: kit.colorId,
        designId: kit.designId,
        description: kit.description,
        images: [{ url: "https://images.test/kit.jpg" }],
        preserveSlug: true,
        hasNoProductIdentifier: true,
        isKit: true,
        components: [{ componentId: f.component.id, quantity: 3 }],
      }),
      { params: { storeId: f.store.id, productId: kit.id } },
    );
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("reservas activas");
  });

  it("convertir crea UN pedido con una línea por producto; la reserva convertida solo se edita desde el pedido", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.component.id, quantity: 2 }, { productId: notebook.id, quantity: 1 }]);
    const { orderId } = await convertReservation(f.store.id, reservation.id, owner());

    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderItems: { orderBy: { name: "asc" } } } });
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.orderItems.map((line) => [line.productId, line.quantity, line.price])).toEqual([
      [f.component.id, 2, 10000],
      [notebook.id, 1, 8000],
    ]);
    expect(order.total).toBe(28000);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 2 });

    const blocked = await addReservationItem(f.store.id, reservation.id, { productId: notebook.id, quantity: 1 }, owner()).catch((error) => error);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.message).toContain(`el pedido ${order.orderNumber}`);
  });

  it("editar las líneas del pedido convertido mueve la reserva en los dos sentidos, con la guarda", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.component.id, quantity: 2 }]);
    const { orderId } = await convertReservation(f.store.id, reservation.id, owner());
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const patch = (orderItems: { productId: string; quantity: number }[]) => PATCH(request("PATCH", { ...CUSTOMER, orderItems }), { params: { storeId: f.store.id, orderId } });

    expect((await patch([{ productId: f.component.id, quantity: 4 }, { productId: notebook.id, quantity: 1 }])).status).toBe(200);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 4 });
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 1 });
    const items = await testPrisma.stockReservationItem.findMany({ where: { reservationId: reservation.id }, orderBy: { createdAt: "asc" }, select: { productId: true, quantity: true } });
    expect(items).toEqual([
      { productId: f.component.id, quantity: 4 },
      { productId: notebook.id, quantity: 1 },
    ]);

    const tooMany = await patch([{ productId: f.component.id, quantity: 4 }, { productId: notebook.id, quantity: 3 }]);
    expect(tooMany.status).toBe(409);
    await expect(counters(notebook.id)).resolves.toMatchObject({ reservedUnits: 1 });
    await expect(testPrisma.orderItem.count({ where: { orderId, productId: notebook.id, quantity: 1 } })).resolves.toBe(1);

    expect((await patch([{ productId: notebook.id, quantity: 1 }])).status).toBe(200);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 0 });

    const { events } = await getReservationDetail(f.store.id, reservation.id);
    expect(events.filter((event) => (event.detail as { via?: string } | null)?.via === "pedido").map((event) => event.kind).sort()).toEqual(["item_added", "item_quantity", "item_removed"]);
    await expect(checkReservationDrift()).resolves.toBe(0);
  });

  it("pagar el pedido convertido consume todos sus productos una sola vez", async () => {
    const { f, notebook } = await setup(2);
    const { reservation } = await create([{ productId: f.component.id, quantity: 2 }, { productId: notebook.id, quantity: 2 }]);
    const { orderId } = await convertReservation(f.store.id, reservation.id, owner());
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const paid = await PATCH(
      request("PATCH", { ...CUSTOMER, status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: `REF-${orderId}` } }),
      { params: { storeId: f.store.id, orderId } },
    );
    expect(paid.status).toBe(200);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 4, reservedUnits: 0, available: 4 });
    await expect(counters(notebook.id)).resolves.toEqual({ stock: 0, reservedUnits: 0, available: 0 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONSUMED });
    const { events } = await getReservationDetail(f.store.id, reservation.id);
    expect(events.filter((event) => event.kind === "consumed")).toHaveLength(1);
  });

  it("«sin respaldo» marca solo el producto que la venta se llevó", async () => {
    const { f, notebook } = await setup(1);
    const { reservation } = await create([{ productId: f.component.id, quantity: 1 }, { productId: notebook.id, quantity: 1 }]);
    await testPrisma.product.update({ where: { id: notebook.id }, data: { stock: 0 } });

    const flagged = await testPrisma.$transaction((tx) => flagUnbackedReservations(tx, [notebook.id, f.component.id]));

    expect(flagged).toEqual([reservation.id]);
    const items = await testPrisma.stockReservationItem.findMany({ where: { reservationId: reservation.id }, select: { productId: true, unbackedAt: true } });
    expect(items.find((item) => item.productId === notebook.id)?.unbackedAt).toBeInstanceOf(Date);
    expect(items.find((item) => item.productId === f.component.id)?.unbackedAt).toBeNull();
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).resolves.toMatchObject({ unbackedAt: expect.any(Date) });

    const notebookItem = (await testPrisma.stockReservationItem.findFirstOrThrow({ where: { reservationId: reservation.id, productId: notebook.id } })).id;
    await setReservationItemQuantity(f.store.id, reservation.id, { itemId: notebookItem, quantity: 0 }, owner());
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).resolves.toMatchObject({ unbackedAt: null });
  });

  it("cliente y extensión quedan en el historial con quién y cuándo, sin los datos", async () => {
    const { f } = await setup();
    const { reservation } = await create([{ productId: f.component.id, quantity: 1 }], { days: 2 });
    await editReservationCustomer(f.store.id, reservation.id, { customerName: "Ana María", note: "Paga el viernes" }, owner());
    const extended = await extendReservation(f.store.id, reservation.id, 3, owner());
    expect(extended.customerName).toBe("Ana María");

    const { events } = await getReservationDetail(f.store.id, reservation.id);
    const edit = events.find((event) => event.kind === "customer_edited");
    expect(edit).toMatchObject({ actor: owner(), detail: { fields: ["customerName", "note"] } });
    expect(JSON.stringify(events)).not.toContain("Ana María");
    expect(events.find((event) => event.kind === "extended")).toMatchObject({ actor: owner(), detail: { days: 3 } });
  });

  it("la API: crear con items[], agregar, cambiar y el detalle con historial; una convertida responde 409", async () => {
    const { f, notebook } = await setup(2);
    const { POST } = await import("@/app/api/[storeId]/stock-reservations/route");
    const created = await POST(request("POST", { items: [{ productId: f.component.id, quantity: 1 }, { productId: notebook.id, quantity: 1 }], customerName: "Clienta API" }), { params: { storeId: f.store.id } });
    expect(created.status).toBe(201);
    const { reservation } = await created.json();

    const route = await import("@/app/api/[storeId]/stock-reservations/[reservationId]/route");
    const params = { params: { storeId: f.store.id, reservationId: reservation.id } };
    expect((await route.PATCH(request("PATCH", { action: "add_item", productId: notebook.id, quantity: 1 }), params)).status).toBe(200);
    const notebookItem = reservation.items.find((item: { productId: string }) => item.productId === notebook.id).id;
    expect((await route.PATCH(request("PATCH", { action: "set_quantity", itemId: notebookItem, quantity: 1 }), params)).status).toBe(200);
    const detail = await (await route.GET(request("GET"), params)).json();
    expect(detail.reservation.items).toHaveLength(2);
    expect(detail.events.length).toBeGreaterThanOrEqual(5);

    await convertReservation(f.store.id, reservation.id, owner());
    expect((await route.PATCH(request("PATCH", { action: "add_item", productId: f.component.id, quantity: 1 }), params)).status).toBe(409);
    session.userId = "user_otra";
    expect((await route.GET(request("GET"), params)).status).toBe(403);
  });

  it("el resumen de las 8:00 trae «Vencen mañana» con los productos de cada reserva", async () => {
    const { f, notebook } = await setup(2);
    const now = new Date(Date.UTC(2026, 9, 15, 13));
    const { reservation } = await create([{ productId: f.component.id, quantity: 2 }, { productId: notebook.id, quantity: 1 }]);
    await testPrisma.stockReservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.UTC(2026, 9, 16, 20)) } });

    await expect(sendDailyDigest(f.store.id, now)).resolves.toBe(true);
    const text = mail.send.mock.calls.at(-1)?.[0].text as string;
    expect(text).toContain("Vencen mañana");
    expect(text).toContain("• Componente × 2, Libreta × 1 — Clienta del grupo");
    expect(text).not.toContain("Vencen hoy");
    await testPrisma.stockReservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(now.getTime() + 3 * DAY) } });
    mail.send.mockClear();
    await expect(sendDailyDigest(f.store.id, now)).resolves.toBe(false);
  });
});
