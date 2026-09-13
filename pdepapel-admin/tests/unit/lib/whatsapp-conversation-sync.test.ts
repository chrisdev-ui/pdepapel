import { MarketplaceWebhookEventStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(),
  claim: vi.fn(),
  updateEvent: vi.fn(),
  storeFindFirst: vi.fn(),
  conversationUpsert: vi.fn(),
  conversationUpdateMany: vi.fn(),
  messageUpsert: vi.fn(),
  messageCreate: vi.fn(),
  messageUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceWebhookEvent: {
      findUnique: mocks.findEvent,
      updateMany: mocks.claim,
      update: mocks.updateEvent,
    },
    store: { findFirst: mocks.storeFindFirst },
    conversation: { upsert: mocks.conversationUpsert, updateMany: mocks.conversationUpdateMany },
    conversationMessage: {
      upsert: mocks.messageUpsert,
      create: mocks.messageCreate,
      updateMany: mocks.messageUpdateMany,
    },
  },
}));

import {
  MAX_WHATSAPP_EVENT_ATTEMPTS,
  extractWhatsAppEvents,
  processWhatsAppWebhookEvent,
} from "@/lib/whatsapp/conversation-sync";

const WABA = "1449676032671804";

function metaPayload(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: WABA, changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }],
  };
}

const batchedPayload = metaPayload({
  metadata: { display_phone_number: "573000000000", phone_number_id: "PHONE-1" },
  contacts: [{ profile: { name: "Laura" }, wa_id: "573001234567" }],
  messages: [
    { from: "573001234567", id: "wamid.1", timestamp: "1789300000", type: "text", text: { body: "Hola, ¿tienen stickers?" } },
    { from: "573001234567", id: "wamid.2", timestamp: "1789300005", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } },
    { from: "573001234567", id: "wamid.3", timestamp: "1789300010", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b1", title: "Sí, quiero" } } },
  ],
});

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    provider: "WHATSAPP",
    status: MarketplaceWebhookEventStatus.PENDING,
    attempts: 0,
    nextRetryAt: null,
    payload: batchedPayload,
    connection: { storeId: "store-1" },
    ...overrides,
  };
}

describe("extractWhatsAppEvents", () => {
  it("collects messages and statuses across every entry and change without throwing", () => {
    const payload = {
      entry: [
        { id: WABA, changes: [{ field: "messages", value: { messages: [{ from: "3001234567", id: "wamid.a", type: "text", text: { body: "uno" } }] } }] },
        {
          id: WABA,
          changes: [
            { field: "messages", value: { statuses: [{ id: "wamid.out", status: "READ", recipient_id: "573001234567" }] } },
            { field: "messages", value: { messages: ["garbage", { id: "wamid.nophone", type: "text" }] } },
            "not-a-change",
          ],
        },
        null,
      ],
    };
    const extracted = extractWhatsAppEvents(payload);
    expect(extracted.messages).toEqual([
      { externalId: "wamid.a", phone: "573001234567", contactName: null, body: "uno", mediaType: null, sentAt: null },
    ]);
    expect(extracted.statuses).toEqual([{ externalId: "wamid.out", status: "READ", rawStatus: "read" }]);
    expect(extracted.skipped).toEqual(["message:not-an-object", "message:wamid.nophone:no-phone"]);
  });

  it("returns an empty result for bodies that are not Meta-shaped", () => {
    expect(extractWhatsAppEvents({ _rawUnparsable: "x" })).toEqual({ messages: [], statuses: [], skipped: [] });
    expect(extractWhatsAppEvents(null)).toEqual({ messages: [], statuses: [], skipped: [] });
    expect(extractWhatsAppEvents("string")).toEqual({ messages: [], statuses: [], skipped: [] });
  });

  it("leaves unknown delivery states unmapped instead of guessing", () => {
    const extracted = extractWhatsAppEvents(metaPayload({ statuses: [{ id: "wamid.x", status: "warning" }, { status: "sent" }] }));
    expect(extracted.statuses).toEqual([{ externalId: "wamid.x", status: null, rawStatus: "warning" }]);
    expect(extracted.skipped).toEqual(["status:no-id"]);
  });
});

describe("processWhatsAppWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.updateEvent.mockResolvedValue({});
    mocks.storeFindFirst.mockResolvedValue({ id: "store-fallback" });
    mocks.conversationUpsert.mockResolvedValue({ id: "conversation-1" });
    mocks.conversationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.messageUpsert.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("files a batched payload as one conversation with its messages in order", async () => {
    mocks.findEvent.mockResolvedValue(event());

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: true,
      reason: "processed",
      messages: 3,
      statuses: 0,
      skipped: 0,
    });

    expect(mocks.claim).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        status: { in: ["PENDING", "RETRY"] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }],
      },
      data: { status: "PROCESSING", attempts: { increment: 1 }, nextRetryAt: null },
    });

    // One conversation keyed by store + channel + normalized phone, refreshed on every message.
    expect(mocks.conversationUpsert).toHaveBeenCalledTimes(3);
    expect(mocks.conversationUpsert.mock.calls[0][0]).toEqual({
      where: { storeId_channel_phone: { storeId: "store-1", channel: "WHATSAPP", phone: "573001234567" } },
      create: {
        storeId: "store-1",
        channel: "WHATSAPP",
        phone: "573001234567",
        contactName: "Laura",
        status: "OPEN",
        lastInboundAt: new Date(1789300000 * 1000),
      },
      update: { contactName: "Laura", lastInboundAt: new Date(1789300000 * 1000) },
      select: { id: true },
    });
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", status: "RESOLVED" },
      data: { status: "OPEN" },
    });
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();

    // Messages are upserted by wamid so a redelivered event never duplicates them.
    expect(mocks.messageUpsert).toHaveBeenCalledTimes(3);
    const created = mocks.messageUpsert.mock.calls.map((call) => call[0]);
    expect(created.map((c) => c.where)).toEqual([{ externalId: "wamid.1" }, { externalId: "wamid.2" }, { externalId: "wamid.3" }]);
    expect(created.map((c) => c.update)).toEqual([{}, {}, {}]);
    expect(created[0].create).toEqual({
      conversationId: "conversation-1",
      direction: "INBOUND",
      sentBy: "CUSTOMER",
      body: "Hola, ¿tienen stickers?",
      mediaType: null,
      status: "RECEIVED",
      rawEventId: "event-1",
      createdAt: new Date(1789300000 * 1000),
      externalId: "wamid.1",
    });
    expect(created[1].create).toMatchObject({ body: null, mediaType: "image", createdAt: new Date(1789300005 * 1000) });
    expect(created[2].create).toMatchObject({ body: "Sí, quiero", mediaType: "interactive" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();

    expect(mocks.updateEvent).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "PROCESSED", processedAt: expect.any(Date), nextRetryAt: null, lastError: null },
    });
  });

  it("applies a delivery status to the message it points at", async () => {
    mocks.findEvent.mockResolvedValue(
      event({ payload: metaPayload({ statuses: [{ id: "wamid.out", status: "delivered", recipient_id: "573001234567" }] }) }),
    );
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject({ processed: true, statuses: 1, messages: 0 });
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({ where: { externalId: "wamid.out" }, data: { status: "DELIVERED" } });
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
  });

  it("skips a status for a message it does not know and still marks the event PROCESSED", async () => {
    mocks.findEvent.mockResolvedValue(event({ payload: metaPayload({ statuses: [{ id: "wamid.unknown", status: "read" }] }) }));
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: true,
      reason: "processed",
      messages: 0,
      statuses: 0,
      skipped: 0,
    });
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.updateEvent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }));
  });

  it("logs and processes a payload whose items it cannot read instead of failing", async () => {
    mocks.findEvent.mockResolvedValue(
      event({ payload: metaPayload({ messages: [{ id: "wamid.nophone", type: "text", text: { body: "x" } }], statuses: [{ id: "wamid.s", status: "warning" }] }) }),
    );
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject({ processed: true, skipped: 2 });
    expect(console.warn).toHaveBeenCalledWith(
      "[WHATSAPP_SYNC] Ítems del evento sin reconocer",
      expect.objectContaining({ skipped: ["message:wamid.nophone:no-phone", "status:wamid.s:warning"] }),
    );
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
  });

  it("falls back to the only store when the event has no connection", async () => {
    mocks.findEvent.mockResolvedValue(event({ connection: null }));
    await processWhatsAppWebhookEvent("event-1");
    expect(mocks.storeFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.conversationUpsert.mock.calls[0][0].create.storeId).toBe("store-fallback");
  });

  it("is a no-op for a missing, foreign or already processed event", async () => {
    mocks.findEvent.mockResolvedValueOnce(null);
    await expect(processWhatsAppWebhookEvent("missing")).resolves.toEqual({ processed: false, reason: "not_found" });

    mocks.findEvent.mockResolvedValueOnce(event({ provider: "MERCADOLIBRE" }));
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "wrong_provider" });

    mocks.findEvent.mockResolvedValueOnce(event({ status: MarketplaceWebhookEventStatus.PROCESSED }));
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "already_processed" });

    mocks.findEvent.mockResolvedValueOnce(event({ status: MarketplaceWebhookEventStatus.RETRY, nextRetryAt: new Date(Date.now() + 60_000) }));
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "not_due" });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
  });

  it("gives up when another worker claimed the event first", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.claim.mockResolvedValue({ count: 0 });
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "claimed_elsewhere" });
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it("schedules a retry with its own delay when the database fails", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.conversationUpsert.mockRejectedValue(new Error("db down"));
    const before = Date.now();

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "retry_scheduled" });
    const data = mocks.updateEvent.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "RETRY", lastError: "db down" });
    expect(data.nextRetryAt.getTime() - before).toBeGreaterThanOrEqual(2 * 60 * 1000 - 50);
    expect(data.nextRetryAt.getTime() - before).toBeLessThan(2 * 60 * 1000 + 5_000);
  });

  it("marks the event FAILED after the last attempt", async () => {
    mocks.findEvent.mockResolvedValue(event({ attempts: MAX_WHATSAPP_EVENT_ATTEMPTS - 1, status: MarketplaceWebhookEventStatus.RETRY }));
    mocks.conversationUpsert.mockRejectedValue(new Error("db down"));

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({ processed: false, reason: "failed" });
    expect(mocks.updateEvent).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        status: "FAILED",
        nextRetryAt: null,
        lastError: `Se agotaron los ${MAX_WHATSAPP_EVENT_ATTEMPTS} intentos. Último error: db down`,
      },
    });
  });
});
