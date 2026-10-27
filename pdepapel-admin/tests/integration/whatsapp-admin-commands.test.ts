import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Comandos por WhatsApp (C1) contra MySQL: el chat de Paula consigo misma no
 * crea conversaciones, solo una entrega firmada guarda comandos, cada eco
 * corre una vez, lo viejo no corre, y la conversación que ya existía con el
 * número del negocio sale de las listas sin tocarla.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rateLimit: vi.fn(),
  qstash: null as unknown as ReturnType<typeof import("../helpers/qstash-fake").createStrictQStash>,
}));

vi.mock("@/lib/whatsapp/bot", () => ({ runWhatsAppBot: vi.fn().mockResolvedValue({ outcome: "escalated_no_match" }) }));
// La cola real con un QStash falso que rechaza las llaves que el real rechaza.
vi.mock("@upstash/qstash", async () => {
  const { createStrictQStash } = await import("../helpers/qstash-fake");
  mocks.qstash = createStrictQStash();
  return { Client: mocks.qstash.Client, Receiver: mocks.qstash.Receiver };
});
vi.mock("@/lib/web-push", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWebPushToStore: mocks.push }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({ ...(await importOriginal<object>()), consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/store-access", async (importOriginal) => ({ ...(await importOriginal<object>()), requireStoreOwner: vi.fn().mockResolvedValue("owner") }));

import { getConversations } from "@/app/(dashboard)/[storeId]/(routes)/conversaciones/server/get-conversations";
import { measureWhatsAppBotRatio } from "@/lib/job-runs";
import { recordSelfChatCommands, runSelfChatCommands } from "@/lib/whatsapp/admin-commands";
import { processWhatsAppWebhookEvent } from "@/lib/whatsapp/conversation-sync";
import { findWaitingConversations } from "@/lib/whatsapp/waiting-list";
import { ingestWhatsAppWebhook, SELF_CHAT_EVENT_NOTE } from "@/lib/whatsapp/webhook-intake";

const suffix = randomUUID().slice(0, 8);
const WABA = `WABA-CMD-${suffix}`;
const BUSINESS = "573009999999";
const BUSINESS_DISPLAY = "+57 300 9999999";
const BUSINESS_BSUID = "CO.7000000000000001";
const CUSTOMER = "573001234567";
const CUSTOMER_BSUID = "CO.7000000000000002";

let storeId = "";
let connectionId = "";
let orderId = "";
const orderNumber = `ORD-CMD-${suffix}`.toUpperCase();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const body = (value: Record<string, unknown>, field = "smb_message_echoes") =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: WABA, changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: BUSINESS_DISPLAY, phone_number_id: "PNID" }, ...value } }] }],
  });

/** Eco del chat consigo misma: del número del negocio al mismo número. */
const selfEcho = (id: string, textBody: string, ts = nowSeconds()) =>
  body({
    contacts: [{ wa_id: BUSINESS, user_id: BUSINESS_BSUID, profile: { username: "pdepapel" } }],
    message_echoes: [{ id, from: BUSINESS, to: BUSINESS, to_user_id: BUSINESS_BSUID, timestamp: String(ts), type: "text", text: { body: textBody } }],
  });

/** Eco hacia una clienta: lo que Paula le contestó desde su celular. */
const customerEcho = (id: string, textBody: string, ts = nowSeconds()) =>
  body({
    contacts: [{ wa_id: CUSTOMER, user_id: CUSTOMER_BSUID, profile: { name: "Clienta" } }],
    message_echoes: [{ id, from: BUSINESS, to: CUSTOMER, to_user_id: CUSTOMER_BSUID, timestamp: String(ts), type: "text", text: { body: textBody } }],
  });

const conversations = () => testPrisma.conversation.findMany({ where: { storeId }, select: { id: true, phone: true } });
const commands = () => testPrisma.whatsAppAdminCommand.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });

describe("comandos por WhatsApp desde el chat consigo misma", () => {
  beforeAll(async () => {
    await testPrisma.$connect();
    const store = await testPrisma.store.create({ data: { name: `Comandos ${suffix}`, userId: `user-${suffix}` }, select: { id: true } });
    storeId = store.id;
    connectionId = (await testPrisma.marketplaceConnection.create({ data: { storeId, provider: "WHATSAPP", sellerId: WABA }, select: { id: true } })).id;
    const order = await testPrisma.order.create({
      data: {
        storeId,
        orderNumber,
        status: OrderStatus.SENT,
        type: OrderType.STANDARD,
        fullName: "Nombre Que No Sale",
        phone: "+573001234567",
        subtotal: 50000,
        total: 62000,
        payment: { create: { storeId, method: PaymentMethod.Bold } },
        shipping: {
          create: {
            storeId,
            provider: ShippingProvider.ENVIOCLICK,
            status: ShippingStatus.InTransit,
            carrierName: "COORDINADORA",
            trackingCode: "GUIA-123",
            trackingEvents: { create: [{ status: "IN_TRANSIT", description: "En centro de distribución", location: "Bogotá", timestamp: new Date("2026-10-27T15:00:00Z") }] },
          },
        },
      },
      select: { id: true },
    });
    orderId = order.id;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.qstash?.published.splice(0);
    mocks.push.mockResolvedValue({ configured: true, devices: 1, delivered: 1, removed: 0, failed: 0 });
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 600 });
    await testPrisma.whatsAppAdminCommand.deleteMany({ where: { storeId } });
    await testPrisma.conversationMessage.deleteMany({ where: { conversation: { storeId } } });
    await testPrisma.conversation.deleteMany({ where: { storeId } });
    await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
    await testPrisma.marketplaceConnection.update({ where: { id: connectionId }, data: { selfPhone: null, selfBsuid: null } });
  });

  afterAll(async () => {
    await testPrisma.whatsAppAdminCommand.deleteMany({ where: { storeId } });
    await testPrisma.conversationMessage.deleteMany({ where: { conversation: { storeId } } });
    await testPrisma.conversation.deleteMany({ where: { storeId } });
    await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
    await testPrisma.shippingTrackingEvent.deleteMany({ where: { shipping: { orderId } } });
    await testPrisma.shipping.deleteMany({ where: { orderId } });
    await testPrisma.paymentDetails.deleteMany({ where: { orderId } });
    await testPrisma.order.deleteMany({ where: { id: orderId } });
    await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
    await testPrisma.store.deleteMany({ where: { id: storeId } });
    await testPrisma.$disconnect();
  });

  it("una entrega firmada guarda el comando, aprende el número del negocio y va a la fila propia", async () => {
    const result = await ingestWhatsAppWebhook(selfEcho("wamid.self1", "/ayuda"), { signed: true });
    expect(result.queued).toBe(true);
    expect(mocks.qstash.published.map((message) => message.flowControl?.key)).toEqual([`whatsapp-conversation-self-${storeId}`]);
    expect(await commands()).toMatchObject([{ echoId: "wamid.self1", command: "ayuda", status: "RECEIVED" }]);
    const connection = await testPrisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection).toMatchObject({ selfPhone: BUSINESS, selfBsuid: BUSINESS_BSUID });
  });

  it("sin firma no guarda comandos ni aprende nada, y el evento se cierra sin crear conversación", async () => {
    const result = await ingestWhatsAppWebhook(selfEcho("wamid.forged", "/estado " + orderNumber));
    expect(result).toMatchObject({ queued: false, selfChat: true });
    expect(mocks.qstash.published).toEqual([]);
    expect(await commands()).toEqual([]);
    const event = await testPrisma.marketplaceWebhookEvent.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(event).toMatchObject({ status: "PROCESSED", lastError: SELF_CHAT_EVENT_NOTE });
    const connection = await testPrisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection).toMatchObject({ selfPhone: null, selfBsuid: null });
    expect(await conversations()).toEqual([]);
  });

  it("un eco hacia una clienta que empieza con «/» nunca es comando: se archiva como respuesta de Paula", async () => {
    const result = await ingestWhatsAppWebhook(customerEcho("wamid.cust1", `/estado ${orderNumber}`), { signed: true });
    expect(mocks.qstash.published.map((message) => message.flowControl?.key)).toEqual([`whatsapp-conversation-${CUSTOMER_BSUID}`]);
    expect(await commands()).toEqual([]);
    await processWhatsAppWebhookEvent(result.eventId);
    const rows = await testPrisma.conversationMessage.findMany({ where: { conversation: { storeId } }, select: { sentBy: true } });
    expect(rows).toEqual([{ sentBy: "OWNER" }]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el procesador ejecuta el comando, avisa por push y no crea conversación", async () => {
    const result = await ingestWhatsAppWebhook(selfEcho("wamid.self2", `/estado ${orderNumber}`), { signed: true });
    const processed = await processWhatsAppWebhookEvent(result.eventId);
    expect(processed).toMatchObject({ processed: true, ownerEchoes: 0 });
    expect(await conversations()).toEqual([]);
    const [row] = await commands();
    expect(row).toMatchObject({ status: "DONE", outcome: "ok", args: orderNumber, orderId, delivered: 1 });
    expect(row.reply).toContain(`Pedido ${orderNumber}: Enviado · Pago en línea`);
    expect(row.reply).toContain("En tránsito · COORDINADORA, guía GUIA-123");
    expect(row.reply).toContain("En centro de distribución (Bogotá)");
    expect(row.reply).not.toContain("Nombre Que No Sale");
    expect(mocks.push).toHaveBeenCalledWith(storeId, expect.objectContaining({ title: "/estado", url: `/${storeId}/pedidos/${orderId}` }));
  });

  it("un reenvío del mismo eco no guarda ni contesta dos veces", async () => {
    const echo = [{ id: "wamid.dup", text: "/ayuda", timestamp: nowSeconds() }];
    expect(await recordSelfChatCommands(storeId, echo)).toBe(1);
    expect(await recordSelfChatCommands(storeId, echo)).toBe(0);
    await runSelfChatCommands(storeId, ["wamid.dup"]);
    await runSelfChatCommands(storeId, ["wamid.dup"]);
    expect(await commands()).toHaveLength(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("con más de 10 minutos no se ejecuta: queda «Llegó tarde» y se avisa para repetirlo", async () => {
    await recordSelfChatCommands(storeId, [{ id: "wamid.old", text: `/estado ${orderNumber}`, timestamp: nowSeconds() - 11 * 60 }]);
    await runSelfChatCommands(storeId, ["wamid.old"]);
    const [row] = await commands();
    expect(row).toMatchObject({ status: "STALE", outcome: "stale", orderId: null });
    expect(row.reply).toContain("más de 10 minutos");
  });

  it("del guion del atraso nunca corre ni avisa", async () => {
    await recordSelfChatCommands(storeId, [{ id: "wamid.backlog", text: "/ayuda", timestamp: nowSeconds() }]);
    await runSelfChatCommands(storeId, ["wamid.backlog"], { backlog: true });
    expect(await commands()).toMatchObject([{ status: "STALE" }]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("pasado el límite no se ejecuta y avisa una sola vez por ventana", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 }).mockResolvedValueOnce({ allowed: true, remaining: 0, retryAfterSeconds: 600 });
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 }).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    await recordSelfChatCommands(storeId, [
      { id: "wamid.rl1", text: "/ayuda", timestamp: nowSeconds() },
      { id: "wamid.rl2", text: "/ayuda", timestamp: nowSeconds() },
    ]);
    await runSelfChatCommands(storeId, ["wamid.rl1", "wamid.rl2"]);
    const rows = await commands();
    expect(rows.map((row) => row.status)).toEqual(["RATE_LIMITED", "RATE_LIMITED"]);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("pedido inexistente, sin número y comando desconocido contestan corto", async () => {
    await recordSelfChatCommands(storeId, [
      { id: "wamid.nf", text: "/estado ORD-NO-EXISTE", timestamp: nowSeconds() },
      { id: "wamid.missing", text: "/estado", timestamp: nowSeconds() },
      { id: "wamid.unknown", text: "/pedido 30000", timestamp: nowSeconds() },
    ]);
    await runSelfChatCommands(storeId, ["wamid.nf", "wamid.missing", "wamid.unknown"]);
    const byEcho = Object.fromEntries((await commands()).map((row) => [row.echoId, row]));
    expect(byEcho["wamid.nf"]).toMatchObject({ outcome: "order_not_found" });
    expect(byEcho["wamid.missing"]).toMatchObject({ outcome: "missing_order" });
    expect(byEcho["wamid.unknown"]).toMatchObject({ command: "pedido", args: null, outcome: "unknown_command" });
    expect(byEcho["wamid.unknown"].reply).toContain("/ayuda");
  });

  describe("la conversación que ya existía con el número del negocio", () => {
    const seed = async () => {
      const self = await testPrisma.conversation.create({
        data: { storeId, phone: BUSINESS, bsuid: BUSINESS_BSUID, status: "OPEN", lastInboundAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      await testPrisma.conversationMessage.create({
        data: { conversationId: self.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "nota", createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const customer = await testPrisma.conversation.create({
        data: { storeId, phone: CUSTOMER, status: "OPEN", lastInboundAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      await testPrisma.conversationMessage.create({
        data: { conversationId: customer.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "Hola, ¿tienen agendas?", createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      const noPhone = await testPrisma.conversation.create({ data: { storeId, phone: null, bsuid: CUSTOMER_BSUID, status: "OPEN" } });
      await testPrisma.marketplaceConnection.update({ where: { id: connectionId }, data: { selfPhone: BUSINESS, selfBsuid: BUSINESS_BSUID } });
      return { self: self.id, customer: customer.id, noPhone: noPhone.id };
    };

    it("sale de Conversaciones y las que no tienen teléfono siguen", async () => {
      const ids = await seed();
      const listed = (await getConversations(storeId)).map((row) => row.id).sort();
      expect(listed).toEqual([ids.customer, ids.noPhone].sort());
      expect(await testPrisma.conversation.count({ where: { id: ids.self } })).toBe(1);
    });

    it("nunca espera a Paula (lista, insignia, aviso y recordatorio salen de aquí)", async () => {
      const ids = await seed();
      const waiting = await findWaitingConversations(storeId, new Date(), 0);
      expect(Array.from(waiting.keys())).toEqual([ids.customer]);
    });

    it("no cuenta en la métrica del bot", async () => {
      await seed();
      const row = await measureWhatsAppBotRatio(storeId, new Date());
      expect(row.detail).toContain("1 de clientas");
    });
  });
});
