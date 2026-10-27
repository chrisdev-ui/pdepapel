import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Comandos que crean cosas (C2) contra MySQL: «/pedido» deja un borrador que
 * no reserva ni escribe a nadie, ligado al chat por teléfono o por usuario;
 * «/guia» cotiza y da un código; «/confirmar» crea la guía una sola vez y por
 * el mismo camino que el panel. EnvioClick nunca se llama: la cotización y la
 * creación de la guía están simuladas.
 */
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rateLimit: vi.fn(),
  requote: vi.fn(),
  createGuide: vi.fn(),
  milestone: vi.fn(),
  session: { userId: null as string | null },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: mocks.session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/web-push", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWebPushToStore: mocks.push }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({ ...(await importOriginal<object>()), consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/shipping-helpers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requoteCartShipping: mocks.requote,
  createGuideForOrder: mocks.createGuide,
}));
vi.mock("@/lib/shipment-notifications", async (importOriginal) => ({ ...(await importOriginal<object>()), queueShipmentMilestone: mocks.milestone }));
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _message: string, run: () => Promise<unknown>) => run(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));

import { getOrderQueue, orderMatchesView } from "@/lib/order-queues";
import { REVENUE_ORDER_STATUSES } from "@/lib/revenue-orders";
import { recordSelfChatCommands, runSelfChatCommands } from "@/lib/whatsapp/admin-commands";
import { hashGuideCode } from "@/lib/whatsapp/admin-command-actions";

const PHONE_TAIL = "3001234567";
const USERNAME = "clienta_sin_numero";
const RATE = { idRate: 555001, carrier: "COORDINADORA", product: "Normal", flete: 12000, minimumInsurance: 300, totalCost: 12300, deliveryDays: 3, isCOD: false };
const nowSeconds = () => Math.floor(Date.now() / 1000);
let seq = 0;

describe("comandos que crean cosas (C2)", () => {
  let f: InventoryFixture;

  const send = async (text: string) => {
    const echo = { id: `wamid.c2-${seq++}`, text, timestamp: nowSeconds() };
    await recordSelfChatCommands(f.store.id, [echo]);
    await runSelfChatCommands(f.store.id, [{ id: echo.id, text }]);
    const row = await testPrisma.whatsAppAdminCommand.findUniqueOrThrow({ where: { echoId: echo.id } });
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as { body: string; url: string } | undefined;
    return { echo, row, pushed };
  };

  beforeAll(async () => {
    await testPrisma.$connect();
    f = await createInventoryFixture();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.push.mockResolvedValue({ configured: true, devices: 1, delivered: 1, removed: 0, failed: 0 });
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 600 });
    mocks.requote.mockResolvedValue([RATE]);
    mocks.createGuide.mockImplementation(async (orderId: string) => {
      await testPrisma.shipping.update({ where: { orderId }, data: { envioClickIdOrder: 9001, trackingCode: "GUIA9001" } });
      return { data: { idOrder: 9001, tracker: "GUIA9001" } };
    });
  });

  afterEach(async () => {
    mocks.session.userId = null;
  });

  afterAll(async () => {
    const orders = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } });
    await testPrisma.whatsAppAdminCommand.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.conversation.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.shipping.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await testPrisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await testPrisma.order.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
    await testPrisma.$disconnect();
  });

  describe("/pedido", () => {
    it("crea un borrador ligado al chat por teléfono, sin productos, sin reservar ni escribir, a nombre de la dueña", async () => {
      const conversation = await testPrisma.conversation.create({ data: { storeId: f.store.id, phone: `57${PHONE_TAIL}`, contactName: "Nombre Que No Sale" } });
      const stockBefore = (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock;
      const movementsBefore = await testPrisma.inventoryMovement.count({ where: { productId: f.component.id } });
      const { row, pushed } = await send(`/pedido 300 123 4567 30 mil para Nombre Que No Sale`);

      expect(row).toMatchObject({ command: "pedido", status: "DONE", outcome: "draft_linked", args: "…4567 30000" });
      const order = await testPrisma.order.findUniqueOrThrow({ where: { id: row.orderId! }, include: { orderItems: true, conversations: true } });
      expect(order).toMatchObject({
        status: OrderStatus.DRAFT,
        source: "WHATSAPP",
        draftOrigin: "whatsapp_command",
        draftAgreedAmount: 30000,
        phone: `+57${PHONE_TAIL}`,
        createdBy: f.store.userId,
        total: 0,
      });
      expect(order.orderItems).toEqual([]);
      expect(order.conversations.map((c) => c.id)).toEqual([conversation.id]);
      expect((await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock).toBe(stockBefore);
      expect(await testPrisma.inventoryMovement.count({ where: { productId: f.component.id } })).toBe(movementsBefore);

      // Aviso sin nombre ni teléfono completo; la nota va al pedido, no a la bitácora.
      expect(pushed?.body).toContain("…4567");
      expect(pushed?.body).toContain("$30.000");
      expect(pushed?.body).not.toContain("Nombre Que No Sale");
      expect(pushed?.body).not.toContain(PHONE_TAIL);
      expect(row.reply).not.toContain("Nombre Que No Sale");
      expect(pushed?.url).toBe(`/${f.store.id}/pedidos/${order.id}`);
    });

    it("fuera de ventas, de «Por atender» y de las métricas; a los 7 días aparece en «Borradores viejos»", async () => {
      const { row } = await send("/pedido 3009998877 12000");
      const order = await testPrisma.order.findUniqueOrThrow({ where: { id: row.orderId! } });
      expect(REVENUE_ORDER_STATUSES).not.toContain(order.status);
      const queue = getOrderQueue(order);
      expect(orderMatchesView(queue, "por-atender", order)).toBe(false);
      expect(orderMatchesView(queue, "borradores-viejos", order)).toBe(false);
      const old = { ...order, createdAt: new Date(Date.now() - 8 * 24 * 3600_000) };
      expect(orderMatchesView(getOrderQueue(old), "borradores-viejos", old)).toBe(true);
    });

    it("clienta sin teléfono visible: se liga por @usuario y el aviso muestra solo el comienzo", async () => {
      const conversation = await testPrisma.conversation.create({ data: { storeId: f.store.id, bsuid: "CO.7000000000000777", username: USERNAME } });
      const { row, pushed } = await send(`/pedido @${USERNAME} 25k`);
      expect(row).toMatchObject({ outcome: "draft_linked", args: "@cl… 25000" });
      const order = await testPrisma.order.findUniqueOrThrow({ where: { id: row.orderId! }, include: { conversations: true } });
      expect(order.phone).toBe("");
      expect(order.conversations.map((c) => c.id)).toEqual([conversation.id]);
      expect(pushed?.body).toContain("@cl…");
      expect(pushed?.body).not.toContain(USERNAME);
    });

    it("sin chat para ese número igual crea el borrador y lo dice; con el chat ocupado no lo pisa", async () => {
      const none = await send("/pedido 3112223344 15000");
      expect(none.row.outcome).toBe("draft_no_conversation");
      expect(none.pushed?.body).toContain("No encontré un chat con ese número");

      const busyOrder = await testPrisma.order.create({ data: { storeId: f.store.id, orderNumber: `ORD-C2-BUSY-${Date.now()}`, status: OrderStatus.PENDING, type: OrderType.STANDARD } });
      await testPrisma.conversation.create({ data: { storeId: f.store.id, phone: "573015550001", orderId: busyOrder.id } });
      const busy = await send("/pedido 3015550001 15000");
      expect(busy.row.outcome).toBe("draft_conversation_busy");
      expect((await testPrisma.conversation.findFirstOrThrow({ where: { phone: "573015550001" } })).orderId).toBe(busyOrder.id);
    });

    it("el mismo eco nunca crea dos borradores", async () => {
      const echo = { id: `wamid.c2-dup-${seq++}`, text: "/pedido 3025556677 20000", timestamp: nowSeconds() };
      expect(await recordSelfChatCommands(f.store.id, [echo])).toBe(1);
      expect(await recordSelfChatCommands(f.store.id, [echo])).toBe(0);
      const before = await testPrisma.order.count({ where: { storeId: f.store.id } });
      await runSelfChatCommands(f.store.id, [{ id: echo.id, text: echo.text }]);
      await runSelfChatCommands(f.store.id, [{ id: echo.id, text: echo.text }]);
      expect(await testPrisma.order.count({ where: { storeId: f.store.id } })).toBe(before + 1);
    });

    it("datos que faltan: contesta cómo y no crea nada", async () => {
      const before = await testPrisma.order.count({ where: { storeId: f.store.id } });
      const { row } = await send("/pedido 12345 30000");
      expect(row.outcome).toBe("bad_phone");
      expect(await testPrisma.order.count({ where: { storeId: f.store.id } })).toBe(before);
    });
  });

  describe("«Crear pedido» en Conversaciones y «Confirmar pedido»", () => {
    it("un chat sin carrito ni teléfono crea un borrador vacío ligado; la segunda vez abre el mismo", async () => {
      mocks.session.userId = f.store.userId;
      const conversation = await testPrisma.conversation.create({ data: { storeId: f.store.id, bsuid: "CO.7000000000000888", username: "otra_clienta" } });
      const { POST } = await import("@/app/api/[storeId]/conversations/[conversationId]/order/route");
      const call = () => POST(new Request("http://admin.test/x", { method: "POST" }), { params: { storeId: f.store.id, conversationId: conversation.id } });
      const first = await (await call()).json();
      expect(first.existing).toBe(false);
      const order = await testPrisma.order.findUniqueOrThrow({ where: { id: first.orderId } });
      expect(order).toMatchObject({ status: OrderStatus.DRAFT, draftOrigin: "conversaciones", fullName: "@otra_clienta", phone: "", createdBy: f.store.userId });
      const second = await (await call()).json();
      expect(second).toEqual({ orderId: first.orderId, existing: true });
    });

    it("confirmar: sin productos no; los productos van a precio de la tienda aunque llegue otro; sin existencias no", async () => {
      mocks.session.userId = f.store.userId;
      const { row } = await send("/pedido 3001112233 8000");
      const orderId = row.orderId!;
      const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
      const customer = { fullName: "Clienta Prueba", phone: "+573001112233", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "La Dorada", department: "Caldas", daneCode: "17380000" };
      const patch = (body: object) =>
        PATCH(new Request("http://admin.test/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
          params: { storeId: f.store.id, orderId },
        });

      const empty = await patch({ ...customer, status: OrderStatus.PENDING, orderItems: [], payment: { method: PaymentMethod.BankTransfer } });
      expect(empty.status).toBe(400);
      expect(JSON.stringify(await empty.json())).toContain("al menos un producto");

      // Guardar el borrador con un precio inventado: queda el de la tienda.
      const saved = await patch({ ...customer, orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 1 }] });
      expect(saved.status).toBe(200);
      const item = await testPrisma.orderItem.findFirstOrThrow({ where: { orderId } });
      expect(Number(item.price)).toBe(10000);

      // Una línea manual no entra en un borrador de WhatsApp.
      const manual = await patch({ ...customer, orderItems: [{ name: "Precio acordado", quantity: 1, price: 8000 }] });
      expect(manual.status).toBe(400);
      expect(JSON.stringify(await manual.json())).toContain("aplica un descuento");

      const tooMany = await patch({ ...customer, status: OrderStatus.PENDING, orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 999 }], payment: { method: PaymentMethod.BankTransfer } });
      expect(tooMany.status).toBeGreaterThanOrEqual(400);
      expect((await testPrisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.DRAFT);
    });
  });

  describe("/guia y /confirmar", () => {
    const paidOrder = async () =>
      testPrisma.order.create({
        data: {
          storeId: f.store.id,
          orderNumber: `ORD-C2-GUIA-${Date.now()}-${seq++}`,
          status: OrderStatus.PAID,
          type: OrderType.STANDARD,
          fullName: "Nombre Que No Sale",
          phone: "+573001234567",
          address: "Calle 1 # 2-3",
          city: "La Dorada",
          department: "Caldas",
          daneCode: "17380000",
          subtotal: 10000,
          total: 22300,
          orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
          payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
          shipping: { create: { storeId: f.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, envioClickIdRate: RATE.idRate, carrierName: RATE.carrier, productName: RATE.product, cost: RATE.totalCost } },
        },
      });

    /** El código sale solo en el aviso: se lee de ahí, como lo hace Paula. */
    const quote = async (orderNumber: string) => {
      const { row, pushed } = await send(`/guia ${orderNumber}`);
      const code = pushed?.body.match(/\/confirmar (\d{4})/)?.[1] ?? null;
      return { row, pushed, code };
    };

    it("cotiza, da un código que no se guarda, y /confirmar crea la guía una sola vez por el camino del panel", async () => {
      const order = await paidOrder();
      const { row, pushed, code } = await quote(order.orderNumber);
      expect(row).toMatchObject({ command: "guia", status: "AWAITING_CONFIRM", outcome: "guide_quoted", orderId: order.id });
      expect(code).toMatch(/^\d{4}$/);
      expect(pushed?.body).toContain("COORDINADORA $12.300");
      expect(row.reply).toContain("/confirmar ····");
      expect(row.reply).not.toContain(code!);
      expect(row.codeHash).toBe(hashGuideCode(row.id, code!));
      expect(mocks.createGuide).not.toHaveBeenCalled();
      // Paso 1 no toca el envío.
      expect((await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } })).envioClickIdOrder).toBeNull();

      const confirm = await send(`/confirmar ${code}`);
      expect(confirm.row).toMatchObject({ command: "confirmar", status: "DONE", outcome: "guide_created", args: null });
      expect(confirm.pushed?.body).toContain("guía GUIA9001");
      expect(confirm.pushed?.body).not.toContain("Nombre Que No Sale");
      expect(mocks.createGuide).toHaveBeenCalledTimes(1);
      expect(mocks.createGuide).toHaveBeenCalledWith(order.id, f.store.id);
      expect(mocks.milestone).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id, milestone: "guia_creada" }));
      expect(await testPrisma.whatsAppAdminCommand.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "DONE", outcome: "guide_created", codeHash: null });

      // Repetir el mismo código ya no hace nada.
      const again = await send(`/confirmar ${code}`);
      expect(again.row.outcome).toBe("no_pending_guide");
      expect(mocks.createGuide).toHaveBeenCalledTimes(1);
    });

    it("código equivocado suma intentos; al tercero anula la cotización; nunca crea guía", async () => {
      const order = await paidOrder();
      const { row, code } = await quote(order.orderNumber);
      const wrong = code === "0000" ? "1111" : "0000";
      expect((await send(`/confirmar ${wrong}`)).row.outcome).toBe("wrong_code");
      expect((await send(`/confirmar ${wrong}`)).row.outcome).toBe("wrong_code");
      expect((await send(`/confirmar ${wrong}`)).row.outcome).toBe("too_many_attempts");
      expect(await testPrisma.whatsAppAdminCommand.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "EXPIRED", codeAttempts: 3, codeHash: null });
      expect((await send(`/confirmar ${code}`)).row.outcome).toBe("no_pending_guide");
      expect(mocks.createGuide).not.toHaveBeenCalled();
    });

    it("código vencido no hace nada", async () => {
      const order = await paidOrder();
      const { row, code } = await quote(order.orderNumber);
      await testPrisma.whatsAppAdminCommand.update({ where: { id: row.id }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
      expect((await send(`/confirmar ${code}`)).row.outcome).toBe("no_pending_guide");
      expect(await testPrisma.whatsAppAdminCommand.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "EXPIRED" });
      expect(mocks.createGuide).not.toHaveBeenCalled();
    });

    it("dos /confirmar a la vez con el código bueno: una sola guía", async () => {
      const order = await paidOrder();
      const { code } = await quote(order.orderNumber);
      const a = { id: `wamid.c2-race-a-${seq++}`, text: `/confirmar ${code}`, timestamp: nowSeconds() };
      const b = { id: `wamid.c2-race-b-${seq++}`, text: `/confirmar ${code}`, timestamp: nowSeconds() };
      await recordSelfChatCommands(f.store.id, [a, b]);
      await Promise.all([runSelfChatCommands(f.store.id, [{ id: a.id, text: a.text }]), runSelfChatCommands(f.store.id, [{ id: b.id, text: b.text }])]);
      expect(mocks.createGuide).toHaveBeenCalledTimes(1);
      const outcomes = (await testPrisma.whatsAppAdminCommand.findMany({ where: { echoId: { in: [a.id, b.id] } }, select: { outcome: true } })).map((r) => r.outcome).sort();
      expect(outcomes).toEqual(["claimed_elsewhere", "guide_created"]);
    });

    it("un pedido sin pagar (o en borrador) no cotiza y no da código", async () => {
      const draft = await send("/pedido 3001234567 10000");
      const draftOrder = await testPrisma.order.findUniqueOrThrow({ where: { id: draft.row.orderId! } });
      const { row, code } = await quote(draftOrder.orderNumber);
      expect(row.outcome).toBe("guide_blocked");
      expect(code).toBeNull();
      expect(mocks.requote).not.toHaveBeenCalled();
    });
  });
});
