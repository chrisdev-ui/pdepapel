import { OrderStatus, PaymentMethod } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Las cuatro garantías de un borrador de WhatsApp («/pedido» o «Crear pedido»
 * en Conversaciones), por los dos caminos que lo crean y mientras Paula lo
 * llena en el panel:
 *   (a) no aparta inventario,
 *   (b) no le escribe a la clienta (ni correo ni WhatsApp),
 *   (c) no cuenta en ventas, ni en «Por atender», ni en el número del menú,
 *   (d) solo se vuelve pedido con «Confirmar pedido», con las reglas de siempre.
 */
const mocks = vi.hoisted(() => ({
  session: { userId: null as string | null },
  push: vi.fn(),
  rateLimit: vi.fn(),
  sendOrderEmail: vi.fn(),
  sendShippingEmail: vi.fn(),
  notifyMilestone: vi.fn(),
  queueMilestone: vi.fn(),
  queueStatusChange: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: mocks.session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue({ publicMetadata: {} }) } }),
}));
vi.mock("@/lib/web-push", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWebPushToStore: mocks.push }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({ ...(await importOriginal<object>()), consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendOrderEmail: mocks.sendOrderEmail,
  sendShippingEmail: mocks.sendShippingEmail,
}));
vi.mock("@/lib/shipment-notifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notifyShipmentMilestone: mocks.notifyMilestone,
  queueShipmentMilestone: mocks.queueMilestone,
  queueShipmentStatusChange: mocks.queueStatusChange,
}));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));

import { countOrdersToAttend, listOrderPage, parseOrderListQuery } from "@/lib/order-list";
import { recordSelfChatCommands, runSelfChatCommands } from "@/lib/whatsapp/admin-commands";

const CUSTOMER = { fullName: "Clienta Prueba", phone: "+573001112233", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "La Dorada", department: "Caldas", daneCode: "17380000" };
const now = new Date();
let seq = 0;

describe("garantías de un borrador de WhatsApp", () => {
  let f: InventoryFixture;

  const draftByCommand = async (text: string) => {
    const echo = { id: `wamid.garantias-${Date.now()}-${seq++}`, text, timestamp: Math.floor(Date.now() / 1000) };
    await recordSelfChatCommands(f.store.id, [echo]);
    await runSelfChatCommands(f.store.id, [{ id: echo.id, text }]);
    const row = await testPrisma.whatsAppAdminCommand.findUniqueOrThrow({ where: { echoId: echo.id } });
    return row.orderId!;
  };

  const draftByButton = async (conversationId: string) => {
    mocks.session.userId = f.store.userId;
    const { POST } = await import("@/app/api/[storeId]/conversations/[conversationId]/order/route");
    const res = await POST(new Request("http://admin.test/x", { method: "POST" }), { params: { storeId: f.store.id, conversationId } });
    return ((await res.json()) as { orderId: string }).orderId;
  };

  const patch = async (orderId: string, body: object) => {
    mocks.session.userId = f.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    return PATCH(new Request("http://admin.test/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
      params: { storeId: f.store.id, orderId },
    });
  };

  /** Lo que «apartar» deja en la base: existencias, movimientos y reservas. */
  const inventorySnapshot = async () => ({
    stock: (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock,
    movements: await testPrisma.inventoryMovement.count({ where: { productId: f.component.id } }),
    reservations: await testPrisma.stockReservation.count({ where: { storeId: f.store.id } }),
  });

  /** Todo lo que le llega a la clienta: correo, avisos de envío (correo y WhatsApp) y mensajes salientes del chat. */
  const expectNothingToCustomer = async (orderId: string, conversationId?: string) => {
    // El correo y los avisos salen en segundo plano: se les da su turno antes de mirar.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.sendOrderEmail).not.toHaveBeenCalled();
    expect(mocks.sendShippingEmail).not.toHaveBeenCalled();
    expect(mocks.notifyMilestone).not.toHaveBeenCalled();
    expect(mocks.queueMilestone).not.toHaveBeenCalled();
    expect(mocks.queueStatusChange).not.toHaveBeenCalled();
    expect(await testPrisma.orderNotification.count({ where: { orderId } })).toBe(0);
    if (conversationId) {
      expect(await testPrisma.conversationMessage.count({ where: { conversationId, direction: "OUTBOUND" } })).toBe(0);
    }
  };

  beforeAll(async () => {
    await testPrisma.$connect();
    f = await createInventoryFixture();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { __resetShortMemo } = await import("@/lib/short-memo");
    __resetShortMemo();
    mocks.push.mockResolvedValue({ configured: true, devices: 1, delivered: 1, removed: 0, failed: 0 });
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 600 });
    mocks.sendOrderEmail.mockResolvedValue(undefined);
    mocks.notifyMilestone.mockResolvedValue({ sent: 0 });
  });

  afterEach(() => {
    mocks.session.userId = null;
  });

  afterAll(async () => {
    const orders = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } });
    const ids = orders.map((o) => o.id);
    const conversations = await testPrisma.conversation.findMany({ where: { storeId: f.store.id }, select: { id: true } });
    await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations.map((c) => c.id) } } });
    await testPrisma.whatsAppAdminCommand.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.conversation.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
    await testPrisma.shipping.deleteMany({ where: { orderId: { in: ids } } });
    await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
    await testPrisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await testPrisma.order.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
    await testPrisma.$disconnect();
  });

  it("(a)+(b) por los dos caminos y al llenarlo en el panel: no aparta inventario y no le escribe a la clienta", async () => {
    const before = await inventorySnapshot();

    const conversation = await testPrisma.conversation.create({ data: { storeId: f.store.id, phone: "573001112233", contactName: "Clienta Prueba" } });
    const byCommand = await draftByCommand("/pedido 3001112233 25 mil");
    expect((await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).orderId).toBe(byCommand);

    const other = await testPrisma.conversation.create({ data: { storeId: f.store.id, bsuid: `CO.garantias-${Date.now()}`, username: "otra_clienta_garantias" } });
    const byButton = await draftByButton(other.id);

    // Paula lo llena: productos, ciudad y dirección, sin confirmar.
    for (const orderId of [byCommand, byButton]) {
      const saved = await patch(orderId, { ...CUSTOMER, orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 3 }] });
      expect(saved.status).toBe(200);
      expect((await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.DRAFT);
    }

    expect(await inventorySnapshot()).toEqual(before);
    await expectNothingToCustomer(byCommand, conversation.id);
    await expectNothingToCustomer(byButton, other.id);
    // El único aviso fue para Paula (el comando), nunca para la clienta.
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0]).toBe(f.store.id);
  });

  it("(c) con productos y total, no cuenta en ventas, ni en «Por atender», ni en el número del menú; a los 7 días va a «Borradores viejos»", async () => {
    mocks.session.userId = f.store.userId;
    const attendBefore = await countOrdersToAttend(testPrisma, f.store.id, now);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { getTotalRevenue } = await import("@/actions/get-total-revenue");
    const { getSalesCount } = await import("@/actions/get-sales-count");
    const { getMonthlyFinancialSummary } = await import("@/actions/get-financial-analytics");
    const { getTodaySummary } = await import("@/lib/dashboard-today");
    const revenueBefore = await getTotalRevenue(f.store.id, year);
    const salesBefore = await getSalesCount(f.store.id, year);
    const monthBefore = await getMonthlyFinancialSummary(f.store.id, year, month);
    const todayBefore = await getTodaySummary(f.store.id, now);

    const orderId = await draftByCommand("/pedido 3009998877 40000");
    expect((await patch(orderId, { ...CUSTOMER, orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 4 }] })).status).toBe(200);
    const draft = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(draft.status).toBe(OrderStatus.DRAFT);
    expect(draft.total).toBeGreaterThan(0);
    const { __resetShortMemo } = await import("@/lib/short-memo");
    __resetShortMemo();

    expect(await getTotalRevenue(f.store.id, year)).toBe(revenueBefore);
    expect(await getSalesCount(f.store.id, year)).toEqual(salesBefore);
    expect(await getMonthlyFinancialSummary(f.store.id, year, month)).toMatchObject({ total_revenue: monthBefore.total_revenue, total_orders: monthBefore.total_orders });
    const today = await getTodaySummary(f.store.id, now);
    expect(today.today).toMatchObject({ net: todayBefore.today.net, orders: todayBefore.today.orders });

    // El número del menú es la pestaña «Por atender» (app/(dashboard)/[storeId]/layout.tsx).
    expect(await countOrdersToAttend(testPrisma, f.store.id, now)).toBe(attendBefore);
    const page = await listOrderPage(testPrisma, f.store.id, parseOrderListQuery({}), now);
    expect(page.counts["por-atender"]).toBe(attendBefore);

    // Ocho días después sigue fuera del menú, pero aparece en «Borradores viejos».
    const later = new Date(now.getTime() + 8 * 24 * 3600_000);
    const oldPage = await listOrderPage(testPrisma, f.store.id, parseOrderListQuery({ vista: "borradores-viejos" }), later);
    expect(oldPage.counts["borradores-viejos"]).toBeGreaterThanOrEqual(1);
    expect(oldPage.ids).toContain(orderId);
    const laterAttend = await listOrderPage(testPrisma, f.store.id, parseOrderListQuery({ vista: "por-atender" }), later);
    expect(laterAttend.ids).not.toContain(orderId);
  });

  it("(d) guardar no lo confirma; «Confirmar pedido» lo vuelve pedido con precio de la tienda, existencias revisadas y el aviso de siempre", async () => {
    const orderId = await draftByCommand("/pedido 3007778899 15000");
    const before = await inventorySnapshot();

    // Guardar con un precio inventado: sigue en borrador y con el precio de la tienda.
    expect((await patch(orderId, { ...CUSTOMER, orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 2, price: 1 }] })).status).toBe(200);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.DRAFT);

    // Sin existencias suficientes no se confirma y queda en borrador.
    const short = await patch(orderId, {
      ...CUSTOMER,
      status: OrderStatus.PENDING,
      orderItems: [{ productId: f.component.id, name: f.component.name, quantity: before.stock + 1 }],
      payment: { method: PaymentMethod.BankTransfer },
    });
    expect(short.status).toBeGreaterThanOrEqual(400);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.DRAFT);
    await expectNothingToCustomer(orderId);

    // «Confirmar pedido».
    const confirmed = await patch(orderId, {
      ...CUSTOMER,
      status: OrderStatus.PENDING,
      orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 2, price: 1 }],
      payment: { method: PaymentMethod.BankTransfer },
    });
    expect(confirmed.status).toBe(200);
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderItems: true } });
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.orderItems.map((item) => Number(item.price))).toEqual([10000]);
    expect(order.subtotal).toBe(20000);
    // Regla de siempre: PENDING no descuenta (se descuenta al pagar).
    expect(await inventorySnapshot()).toEqual(before);
    // Desde aquí la clienta sí recibe el aviso normal de su pedido, una vez.
    await vi.waitFor(() => expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1));
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(orderId, OrderStatus.PENDING, expect.objectContaining({ notifyAdmin: false }));
  });
});
