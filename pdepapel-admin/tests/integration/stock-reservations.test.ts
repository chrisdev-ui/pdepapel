import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, PaymentMethod, StockReservationStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { validateStockAvailability } from "@/lib/inventory";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { convertReservation, createReservation, extendReservation, releaseReservation } from "@/lib/stock-reservations";
import { checkReservationDrift, sendDailyDigest, sweepStockReservations } from "@/lib/stock-reservations-job";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Reservas contra MySQL real: la última unidad no se reserva dos veces ni se
 * vende reservada, un kit reserva sus piezas, el pedido convertido consume
 * su propia reserva al pagarse (también en el cambio masivo) y la libera al
 * cancelarse o borrarse, y la corrida horaria vence sin descontar dos veces.
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
const request = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const counters = async (id: string) => {
  const product = await testPrisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedUnits: true } });
  return { ...product, available: availableStock(product) };
};

describe("reservas (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  const setup = async (stock: number) => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { stock } });
    return fixture;
  };
  const reserve = (f: InventoryFixture, quantity: number, extra: { productId?: string; days?: number } = {}) =>
    createReservation({ storeId: f.store.id, productId: extra.productId ?? f.component.id, quantity, customerName: "Clienta del grupo", days: extra.days, createdBy: f.store.userId });

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

  it("dos reservas por la última unidad: una gana y la otra recibe 409 con lo que queda", async () => {
    const f = await setup(1);
    const results = await Promise.allSettled([reserve(f, 1), reserve(f, 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409, message: expect.stringContaining("No hay unidades disponibles") });
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 1, reservedUnits: 1, available: 0 });
    await expect(testPrisma.stockReservation.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
  });

  it("reserva y punto de venta por la última unidad: nunca se venden unidades reservadas", async () => {
    const f = await setup(1);
    const results = await Promise.allSettled([
      reserve(f, 1),
      createPointOfSaleSale({ storeId: f.store.id, items: [{ productId: f.component.id, quantity: 1 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: `pos-race-${randomUUID()}`, userId: f.store.userId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ statusCode: expect.any(Number), message: expect.not.stringContaining("Elige efectivo") });
    const after = await counters(f.component.id);
    expect([{ stock: 1, reservedUnits: 1, available: 0 }, { stock: 0, reservedUnits: 0, available: 0 }]).toContainEqual(after);
  });

  it("lo reservado deja de estar disponible para la tienda (la validación del checkout lo rechaza)", async () => {
    const f = await setup(3);
    await reserve(f, 2);
    await expect(testPrisma.$transaction((tx) => validateStockAvailability(tx, [{ productId: f.component.id, quantity: 2 }]))).rejects.toMatchObject({
      message: expect.stringContaining("Stock insuficiente"),
      details: expect.objectContaining({ items: [expect.objectContaining({ available: 1, requested: 2 })] }),
    });
    await expect(testPrisma.$transaction((tx) => validateStockAvailability(tx, [{ productId: f.component.id, quantity: 1 }]))).resolves.toBeUndefined();
  });

  it("valida cantidad, nombre y días; un producto de otra tienda no existe", async () => {
    const f = await setup(3);
    await expect(reserve(f, 0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(reserve(f, 1, { days: 61 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createReservation({ storeId: f.store.id, productId: f.component.id, quantity: 1, customerName: " a ", createdBy: "u" })).rejects.toMatchObject({ statusCode: 400 });
    const other = await createInventoryFixture();
    try {
      await expect(createReservation({ storeId: other.store.id, productId: f.component.id, quantity: 1, customerName: "Clienta", createdBy: "u" })).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await deleteInventoryFixture(other);
    }
    const ok = await reserve(f, 1);
    expect(ok.reservation.expiresAt.getTime() - Date.now()).toBeGreaterThan(2.9 * DAY);
  });

  it("un kit reserva sus piezas, y reservar piezas baja lo disponible del kit", async () => {
    const f = await setup(6);
    const { reservation } = await reserve(f, 1, { productId: f.kit.id });
    await expect(counters(f.component.id)).resolves.toMatchObject({ stock: 6, reservedUnits: 2 });
    expect(availableStock(await testPrisma.product.findUniqueOrThrow({ where: { id: f.kit.id } }))).toBe(2);

    await reserve(f, 3);
    expect(availableStock(await testPrisma.product.findUniqueOrThrow({ where: { id: f.kit.id } }))).toBe(0);
    await expect(reserve(f, 1, { productId: f.kit.id })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("el kit «Kit»") });

    await releaseReservation(f.store.id, reservation.id, f.store.userId);
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 3 });
    expect(availableStock(await testPrisma.product.findUniqueOrThrow({ where: { id: f.kit.id } }))).toBe(1);
  });

  it("no deja cambiar la receta de un kit con reservas vigentes", async () => {
    const f = await setup(6);
    await reserve(f, 1, { productId: f.kit.id });
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
    await expect(testPrisma.productKit.findFirstOrThrow({ where: { kitId: kit.id } })).resolves.toMatchObject({ quantity: 2 });
  });

  it("convertir crea un pedido pendiente del panel; pagarlo consume la reserva aunque guarde la última unidad", async () => {
    const f = await setup(1);
    const { reservation } = await reserve(f, 1);
    const { orderId } = await convertReservation(f.store.id, reservation.id, f.store.userId);
    await expect(convertReservation(f.store.id, reservation.id, f.store.userId)).resolves.toEqual({ orderId, existing: true });

    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderItems: true } });
    expect(order).toMatchObject({ status: OrderStatus.PENDING, source: OrderSource.PANEL, fullName: "Clienta del grupo", total: 10000 });
    expect(order.orderItems).toEqual([expect.objectContaining({ productId: f.component.id, quantity: 1, price: 10000 })]);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 1, reservedUnits: 1, available: 0 });

    // Pagarlo exige los datos de siempre (correo y dirección); la reserva solo trae nombre y celular.
    await testPrisma.order.update({ where: { id: orderId }, data: { phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" } });
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await PATCH(
      request("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-RESERVA" } }),
      { params: { storeId: f.store.id, orderId } },
    );
    expect(response.status).toBe(200);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 0, reservedUnits: 0, available: 0 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONSUMED, unbackedAt: null });
    await expect(testPrisma.orderInventoryIssue.count({ where: { orderId } })).resolves.toBe(0);
  });

  it("el cambio masivo a pagado no choca con la reserva del propio pedido", async () => {
    const f = await setup(1);
    const { reservation } = await reserve(f, 1);
    const { orderId } = await convertReservation(f.store.id, reservation.id, f.store.userId);
    const { PATCH } = await import("@/app/api/[storeId]/orders/route");
    const response = await PATCH(request("PATCH", { ids: [orderId], status: OrderStatus.PAID }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(200);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 0, reservedUnits: 0, available: 0 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONSUMED });
  });

  it("cancelar el pedido convertido libera la reserva; borrarlo también", async () => {
    const f = await setup(2);
    const first = await reserve(f, 1);
    const second = await reserve(f, 1);
    const cancelled = await convertReservation(f.store.id, first.reservation.id, f.store.userId);
    const deleted = await convertReservation(f.store.id, second.reservation.id, f.store.userId);

    const { PATCH, DELETE } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await PATCH(request("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PENDING }), { params: { storeId: f.store.id, orderId: cancelled.orderId } });
    expect(response.status).toBe(200);
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: first.reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.RELEASED });
    await expect(counters(f.component.id)).resolves.toMatchObject({ stock: 2, reservedUnits: 1 });

    const removed = await DELETE(request("DELETE"), { params: { storeId: f.store.id, orderId: deleted.orderId } });
    expect(removed.status).toBe(200);
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: second.reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.RELEASED });
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 2, reservedUnits: 0, available: 2 });
  });

  it("liberar dos veces no descuenta dos veces; extender corre desde la fecha más tarde", async () => {
    const f = await setup(3);
    const { reservation } = await reserve(f, 2, { days: 1 });
    const extended = await extendReservation(f.store.id, reservation.id, 2);
    expect(extended.expiresAt.getTime() - reservation.expiresAt.getTime()).toBe(2 * DAY);

    const results = await Promise.all([
      releaseReservation(f.store.id, reservation.id, "a"),
      releaseReservation(f.store.id, reservation.id, "b"),
    ]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 3, reservedUnits: 0, available: 3 });
    await expect(extendReservation(f.store.id, reservation.id, 1)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("la corrida vence lo pasado de fecha una sola vez, libera los de pedido cancelado y avisa de los convertidos vencidos", async () => {
    const f = await setup(5);
    const expired = await reserve(f, 1);
    const kept = await reserve(f, 1);
    const cancelledHold = await reserve(f, 1);
    const overdueHold = await reserve(f, 1);
    const cancelled = await convertReservation(f.store.id, cancelledHold.reservation.id, f.store.userId);
    await convertReservation(f.store.id, overdueHold.reservation.id, f.store.userId);
    const past = new Date(Date.now() - DAY);
    await testPrisma.stockReservation.updateMany({ where: { id: { in: [expired.reservation.id, overdueHold.reservation.id] } }, data: { expiresAt: past } });
    await testPrisma.order.update({ where: { id: cancelled.orderId }, data: { status: OrderStatus.CANCELLED } });
    const now = new Date(Date.UTC(2026, 9, 14, 18));

    const first = await sweepStockReservations({ now });
    expect(first).toMatchObject({ expired: 1, releasedForClosedOrders: 1, convertedOverdueAlerts: 1, driftProducts: 0 });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("venció sin pagar"), text: expect.stringContaining("Clienta del grupo") }));
    await expect(counters(f.component.id)).resolves.toMatchObject({ stock: 5, reservedUnits: 2 });

    const second = await sweepStockReservations({ now });
    expect(second).toMatchObject({ expired: 0, releasedForClosedOrders: 0 });
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 2 });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: kept.reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.ACTIVE });
    await expect(testPrisma.stockReservation.findUniqueOrThrow({ where: { id: overdueHold.reservation.id } })).resolves.toMatchObject({ status: StockReservationStatus.CONVERTED });
    await expect(testPrisma.jobRun.findFirst({ where: { name: "stock-reservations" } })).resolves.toMatchObject({ ok: true });
  });

  it("un contador descuadrado se avisa y no se corrige", async () => {
    const f = await setup(5);
    await reserve(f, 2);
    await testPrisma.product.update({ where: { id: f.component.id }, data: { reservedUnits: 3 } });
    await expect(checkReservationDrift()).resolves.toBeGreaterThanOrEqual(1);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("Reservas descuadradas"), text: expect.stringContaining("el contador dice 3, las reservas suman 2") }));
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 3 });
    await testPrisma.product.update({ where: { id: f.component.id }, data: { reservedUnits: 2 } });
  });

  it("el resumen diario cuenta lo que vence hoy y no sale si no hay nada", async () => {
    const f = await setup(5);
    const now = new Date(Date.UTC(2026, 9, 14, 13));
    await expect(sendDailyDigest(f.store.id, now)).resolves.toBe(false);
    expect(mail.send).not.toHaveBeenCalled();

    const { reservation } = await reserve(f, 1);
    await testPrisma.stockReservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.UTC(2026, 9, 14, 20)) } });
    await expect(sendDailyDigest(f.store.id, now)).resolves.toBe(true);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("[Reservas] Resumen"), text: expect.stringContaining("Vencen hoy (1)") }));
  });

  it("la API exige la dueña de la tienda y crea, lista y libera", async () => {
    const f = await setup(3);
    const { GET, POST } = await import("@/app/api/[storeId]/stock-reservations/route");
    const body = { productId: f.component.id, quantity: 1, customerName: "Clienta del grupo" };

    session.userId = null;
    expect((await POST(request("POST", body), { params: { storeId: f.store.id } })).status).toBe(401);
    session.userId = "otra-persona";
    expect((await POST(request("POST", body), { params: { storeId: f.store.id } })).status).toBeGreaterThanOrEqual(403);
    session.userId = f.store.userId;

    const created = await POST(request("POST", body), { params: { storeId: f.store.id } });
    expect(created.status).toBe(201);
    const { reservation } = (await created.json()) as { reservation: { id: string } };
    const id = reservation.id;
    const list = await GET(new Request("http://admin.test/api/x?filtro=activas"), { params: { storeId: f.store.id } });
    expect(((await list.json()) as { reservations: { id: string }[] }).reservations.map((row) => row.id)).toEqual([id]);

    const { PATCH } = await import("@/app/api/[storeId]/stock-reservations/[reservationId]/route");
    expect((await PATCH(request("PATCH", { action: "liberar" }), { params: { storeId: f.store.id, reservationId: id } })).status).toBe(200);
    await expect(counters(f.component.id)).resolves.toEqual({ stock: 3, reservedUnits: 0, available: 3 });
  });

  it("repetir «Liberar» o «Convertir» por la API no hace nada la segunda vez", async () => {
    const f = await setup(4);
    const other = await reserve(f, 1);
    const target = await reserve(f, 2);
    const { PATCH } = await import("@/app/api/[storeId]/stock-reservations/[reservationId]/route");
    const { POST: CONVERT } = await import("@/app/api/[storeId]/stock-reservations/[reservationId]/convert/route");
    const params = (reservationId: string) => ({ params: { storeId: f.store.id, reservationId } });

    const first = await PATCH(request("PATCH", { action: "liberar" }), params(target.reservation.id));
    expect(await first.json()).toEqual({ released: true });
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 1 });
    const again = await PATCH(request("PATCH", { action: "liberar" }), params(target.reservation.id));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ released: false });
    await expect(counters(f.component.id)).resolves.toMatchObject({ reservedUnits: 1 });

    const converted = await CONVERT(request("POST"), params(other.reservation.id));
    expect(converted.status).toBe(201);
    const { orderId } = (await converted.json()) as { orderId: string };
    const repeated = await CONVERT(request("POST"), params(other.reservation.id));
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual({ orderId, existing: true });
    await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
    await expect(counters(f.component.id)).resolves.toMatchObject({ stock: 4, reservedUnits: 1 });
  });
});
