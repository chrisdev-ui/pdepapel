import { MarketplaceWebhookEventStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimRow: vi.fn(),
  findEvent: vi.fn(),
  claim: vi.fn(),
  updateEvent: vi.fn(),
  storeFindFirst: vi.fn(),
  conversationUpsert: vi.fn(),
  conversationUpdateMany: vi.fn(),
  messageUpsert: vi.fn(),
  messageCreate: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdateMany: vi.fn(),
  runBot: vi.fn(),
}));

vi.mock("@/lib/whatsapp/bot", () => ({ runWhatsAppBot: mocks.runBot }));

vi.mock("@/lib/atomic-claim", () => ({ claimQueueRow: mocks.claimRow }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceWebhookEvent: {
      findUnique: mocks.findEvent,
      updateMany: mocks.claim,
      update: mocks.updateEvent,
    },
    store: { findFirst: mocks.storeFindFirst },
    conversation: {
      upsert: mocks.conversationUpsert,
      updateMany: mocks.conversationUpdateMany,
    },
    conversationMessage: {
      upsert: mocks.messageUpsert,
      create: mocks.messageCreate,
      findUnique: mocks.messageFindUnique,
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
    entry: [
      {
        id: WABA,
        changes: [
          {
            field: "messages",
            value: { messaging_product: "whatsapp", ...value },
          },
        ],
      },
    ],
  };
}

const batchedPayload = metaPayload({
  metadata: {
    display_phone_number: "573000000000",
    phone_number_id: "PHONE-1",
  },
  contacts: [{ profile: { name: "Laura" }, wa_id: "573001234567" }],
  messages: [
    {
      from: "573001234567",
      id: "wamid.1",
      timestamp: "1789300000",
      type: "text",
      text: { body: "Hola, ¿tienen stickers?" },
    },
    {
      from: "573001234567",
      id: "wamid.2",
      timestamp: "1789300005",
      type: "image",
      image: { id: "media-1", mime_type: "image/jpeg" },
    },
    {
      from: "573001234567",
      id: "wamid.3",
      timestamp: "1789300010",
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "b1", title: "Sí, quiero" },
      },
    },
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
        {
          id: WABA,
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: "3001234567",
                    id: "wamid.a",
                    type: "text",
                    text: { body: "uno" },
                  },
                ],
              },
            },
          ],
        },
        {
          id: WABA,
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  {
                    id: "wamid.out",
                    status: "READ",
                    recipient_id: "573001234567",
                  },
                ],
              },
            },
            {
              field: "messages",
              value: {
                messages: ["garbage", { id: "wamid.nophone", type: "text" }],
              },
            },
            "not-a-change",
          ],
        },
        null,
      ],
    };
    const extracted = extractWhatsAppEvents(payload);
    expect(extracted.messages).toEqual([
      {
        externalId: "wamid.a",
        phone: "573001234567",
        contactName: null,
        body: "uno",
        mediaType: null,
        sentAt: null,
        interactiveReplyId: null,
        metadata: null,
      },
    ]);
    expect(extracted.statuses).toEqual([
      { externalId: "wamid.out", status: "READ", rawStatus: "read" },
    ]);
    expect(extracted.skipped).toEqual([
      "message:not-an-object",
      "message:wamid.nophone:no-phone",
    ]);
  });

  it("lee el id del botón que tocó la clienta, no solo su texto", () => {
    // Payload real capturado el 2026-09-14 tocando una lista enviada de prueba.
    // El id es la llave estable: Paula puede renombrar el botón sin romper el
    // menú, cosa que el título no permite.
    const extracted = extractWhatsAppEvents({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.tap",
                    from: "573024686403",
                    type: "interactive",
                    timestamp: "1789377712",
                    context: { id: "wamid.menu", from: "573132582293" },
                    interactive: {
                      type: "list_reply",
                      list_reply: {
                        id: "p_catalogo",
                        title: "Ver catálogo",
                        description: "Abrir la tienda en WhatsApp",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(extracted.messages[0]).toMatchObject({
      body: "Ver catálogo",
      mediaType: "interactive",
      interactiveReplyId: "p_catalogo",
    });
  });

  it("lee también el id de un botón de respuesta rápida", () => {
    const extracted = extractWhatsAppEvents({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.tap2",
                    from: "573024686403",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "r:abc-123", title: "Ver horarios" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(extracted.messages[0]).toMatchObject({
      body: "Ver horarios",
      interactiveReplyId: "r:abc-123",
    });
  });

  it("reads an owner echo, taking the customer phone from `to` and not `from`", () => {
    const extracted = extractWhatsAppEvents({
      entry: [
        {
          id: WABA,
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                message_echoes: [
                  {
                    from: "573132582293",
                    to: "573001234567",
                    id: "wamid.echo1",
                    timestamp: "1789300100",
                    type: "text",
                    text: { body: "Claro, te confirmo" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(extracted.ownerEchoes).toEqual([
      {
        externalId: "wamid.echo1",
        // El teléfono de la clienta, no el de la tienda.
        phone: "573001234567",
        body: "Claro, te confirmo",
        mediaType: null,
        sentAt: new Date(1789300100 * 1000),
      },
    ]);
    expect(extracted.messages).toEqual([]);
  });

  it("rescues what it can from non-text echoes and never throws", () => {
    const extracted = extractWhatsAppEvents({
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                message_echoes: [
                  {
                    to: "573001234567",
                    id: "e1",
                    type: "image",
                    image: { caption: "Mira esta" },
                  },
                  {
                    to: "573001234567",
                    id: "e2",
                    type: "revoke",
                    revoke: { original_message_id: "wamid.x" },
                  },
                  {
                    to: "573001234567",
                    id: "e3",
                    type: "edit",
                    edit: {
                      original_message_id: "wamid.y",
                      message: { type: "text", text: { body: "Corregido" } },
                    },
                  },
                  {
                    from: "573132582293",
                    id: "e4",
                    type: "text",
                    text: { body: "sin destinatario" },
                  },
                  "garbage",
                ],
              },
            },
          ],
        },
      ],
    });

    expect(
      extracted.ownerEchoes.map((echo) => [
        echo.externalId,
        echo.body,
        echo.mediaType,
      ]),
    ).toEqual([
      ["e1", "Mira esta", "image"],
      ["e2", null, "revoke"],
      ["e3", "Corregido", "edit"],
    ]);
    expect(extracted.skipped).toEqual([
      "echo:e4:no-phone",
      "echo:not-an-object",
    ]);
  });

  it("captures a catalog cart, keeping the SKU that the feed publishes as the product id", () => {
    const extracted = extractWhatsAppEvents(
      metaPayload({
        contacts: [{ profile: { name: "Christian" }, wa_id: "573024686403" }],
        messages: [
          {
            from: "573024686403",
            id: "wamid.CART",
            timestamp: "1789300000",
            type: "order",
            order: {
              text: "¿me lo puedes apartar?",
              catalog_id: "1049887011264361",
              product_items: [
                {
                  product_retailer_id: "AGE-CLS-AZU-XS-L-2868",
                  quantity: 1,
                  item_price: 13000,
                  currency: "COP",
                },
                {
                  product_retailer_id: "STI-KAW-001",
                  quantity: "3",
                  item_price: 4500,
                  currency: "COP",
                },
              ],
            },
          },
        ],
      }),
    );

    expect(extracted.messages).toHaveLength(1);
    const [cart] = extracted.messages;
    expect(cart.mediaType).toBe("order");
    // La nota del carrito se usa como cuerpo, que si no quedaría vacío.
    expect(cart.body).toBe("¿me lo puedes apartar?");
    expect(cart.metadata).toEqual({
      order: {
        catalogId: "1049887011264361",
        note: "¿me lo puedes apartar?",
        items: [
          {
            sku: "AGE-CLS-AZU-XS-L-2868",
            quantity: 1,
            unitPrice: 13000,
            currency: "COP",
          },
          // La cantidad llega como texto en algunos carritos.
          { sku: "STI-KAW-001", quantity: 3, unitPrice: 4500, currency: "COP" },
        ],
      },
    });
  });

  it("ignores a cart with no readable lines instead of storing an empty one", () => {
    const noItems = extractWhatsAppEvents(
      metaPayload({
        messages: [
          {
            from: "573001234567",
            id: "w1",
            type: "order",
            order: { catalog_id: "c1", product_items: [] },
          },
        ],
      }),
    );
    expect(noItems.messages[0].metadata).toBeNull();

    const junk = extractWhatsAppEvents(
      metaPayload({
        messages: [
          {
            from: "573001234567",
            id: "w2",
            type: "order",
            order: { product_items: ["nope", { quantity: 2 }] },
          },
        ],
      }),
    );
    expect(junk.messages[0].metadata).toBeNull();
    expect(junk.messages[0].mediaType).toBe("order");
  });

  it("returns an empty result for bodies that are not Meta-shaped", () => {
    const empty = { messages: [], ownerEchoes: [], statuses: [], skipped: [] };
    expect(extractWhatsAppEvents({ _rawUnparsable: "x" })).toEqual(empty);
    expect(extractWhatsAppEvents(null)).toEqual(empty);
    expect(extractWhatsAppEvents("string")).toEqual(empty);
  });

  it("leaves unknown delivery states unmapped instead of guessing", () => {
    const extracted = extractWhatsAppEvents(
      metaPayload({
        statuses: [{ id: "wamid.x", status: "warning" }, { status: "sent" }],
      }),
    );
    expect(extracted.statuses).toEqual([
      { externalId: "wamid.x", status: null, rawStatus: "warning" },
    ]);
    expect(extracted.skipped).toEqual(["status:no-id"]);
  });
});

describe("processWhatsAppWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.claimRow.mockResolvedValue(true);
    mocks.updateEvent.mockResolvedValue({});
    mocks.storeFindFirst.mockResolvedValue({ id: "store-fallback" });
    mocks.conversationUpsert.mockResolvedValue({ id: "conversation-1" });
    mocks.conversationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.messageUpsert.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });
    mocks.runBot.mockResolvedValue({ outcome: "escalated_no_match" });
  });

  it("files a batched payload as one conversation with its messages in order", async () => {
    mocks.findEvent.mockResolvedValue(event());

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: true,
      reason: "processed",
      messages: 3,
      ownerEchoes: 0,
      statuses: 0,
      skipped: 0,
      // Solo los dos mensajes con texto pasan por el bot: la imagen no tiene cuerpo.
      botOutcomes: ["escalated_no_match", "escalated_no_match"],
    });

    expect(mocks.claimRow).toHaveBeenCalledWith({
      table: "MarketplaceWebhookEvent",
      id: "event-1",
      from: ["PENDING", "RETRY"],
      dueColumn: "nextRetryAt",
      dueNullMeansReady: true,
      now: expect.any(Date),
    });

    // One conversation keyed by store + channel + normalized phone, refreshed on every message.
    expect(mocks.conversationUpsert).toHaveBeenCalledTimes(3);
    expect(mocks.conversationUpsert.mock.calls[0][0]).toEqual({
      where: {
        storeId_channel_phone: {
          storeId: "store-1",
          channel: "WHATSAPP",
          phone: "573001234567",
        },
      },
      create: {
        storeId: "store-1",
        channel: "WHATSAPP",
        phone: "573001234567",
        contactName: "Laura",
        status: "OPEN",
        lastInboundAt: new Date(1789300000 * 1000),
      },
      update: {
        contactName: "Laura",
        lastInboundAt: new Date(1789300000 * 1000),
      },
      select: { id: true },
    });
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", status: "RESOLVED" },
      data: { status: "OPEN" },
    });
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();

    // Se consulta por wamid antes de crear, para que un evento reenviado no
    // duplique la fila ni vuelva a disparar al bot.
    expect(mocks.messageFindUnique).toHaveBeenCalledTimes(3);
    expect(
      mocks.messageFindUnique.mock.calls.map((call) => call[0].where),
    ).toEqual([
      { externalId: "wamid.1" },
      { externalId: "wamid.2" },
      { externalId: "wamid.3" },
    ]);
    expect(mocks.messageCreate).toHaveBeenCalledTimes(3);
    const created = mocks.messageCreate.mock.calls.map((call) => call[0]);
    expect(created[0].data).toEqual({
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
    expect(created[1].data).toMatchObject({
      body: null,
      mediaType: "image",
      createdAt: new Date(1789300005 * 1000),
    });
    expect(created[2].data).toMatchObject({
      body: "Sí, quiero",
      mediaType: "interactive",
    });
    expect(mocks.messageUpsert).not.toHaveBeenCalled();

    expect(mocks.updateEvent).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        status: "PROCESSED",
        processedAt: expect.any(Date),
        nextRetryAt: null,
        lastError: null,
      },
    });
  });

  it("applies a delivery status to the message it points at", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        payload: metaPayload({
          statuses: [
            {
              id: "wamid.out",
              status: "delivered",
              recipient_id: "573001234567",
            },
          ],
        }),
      }),
    );
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      { processed: true, statuses: 1, messages: 0 },
    );
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: { externalId: "wamid.out" },
      data: { status: "DELIVERED" },
    });
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
  });

  it("skips a status for a message it does not know and still marks the event PROCESSED", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        payload: metaPayload({
          statuses: [{ id: "wamid.unknown", status: "read" }],
        }),
      }),
    );
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: true,
      reason: "processed",
      messages: 0,
      ownerEchoes: 0,
      statuses: 0,
      skipped: 0,
      botOutcomes: [],
    });
    expect(mocks.messageUpsert).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });

  it("logs and processes a payload whose items it cannot read instead of failing", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        payload: metaPayload({
          messages: [
            { id: "wamid.nophone", type: "text", text: { body: "x" } },
          ],
          statuses: [{ id: "wamid.s", status: "warning" }],
        }),
      }),
    );
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      { processed: true, skipped: 2 },
    );
    expect(console.warn).toHaveBeenCalledWith(
      "[WHATSAPP_SYNC] Ítems del evento sin reconocer",
      expect.objectContaining({
        skipped: ["message:wamid.nophone:no-phone", "status:wamid.s:warning"],
      }),
    );
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
  });

  it("falls back to the only store when the event has no connection", async () => {
    mocks.findEvent.mockResolvedValue(event({ connection: null }));
    await processWhatsAppWebhookEvent("event-1");
    expect(mocks.storeFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.conversationUpsert.mock.calls[0][0].create.storeId).toBe(
      "store-fallback",
    );
  });

  it("is a no-op for a missing, foreign or already processed event", async () => {
    mocks.findEvent.mockResolvedValueOnce(null);
    await expect(processWhatsAppWebhookEvent("missing")).resolves.toEqual({
      processed: false,
      reason: "not_found",
    });

    mocks.findEvent.mockResolvedValueOnce(event({ provider: "MERCADOLIBRE" }));
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "wrong_provider",
    });

    mocks.findEvent.mockResolvedValueOnce(
      event({ status: MarketplaceWebhookEventStatus.PROCESSED }),
    );
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "already_processed",
    });

    mocks.findEvent.mockResolvedValueOnce(
      event({
        status: MarketplaceWebhookEventStatus.RETRY,
        nextRetryAt: new Date(Date.now() + 60_000),
      }),
    );
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "not_due",
    });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
  });

  it("files an owner echo as OUTBOUND and clears NEEDS_OWNER", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        payload: {
          entry: [
            {
              id: WABA,
              changes: [
                {
                  field: "smb_message_echoes",
                  value: {
                    message_echoes: [
                      {
                        from: "573132582293",
                        to: "573001234567",
                        id: "wamid.echo1",
                        timestamp: "1789300100",
                        type: "text",
                        text: { body: "Claro, te confirmo" },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    );

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      {
        processed: true,
        ownerEchoes: 1,
        messages: 0,
        botOutcomes: [],
      },
    );

    expect(mocks.conversationUpsert).toHaveBeenCalledWith({
      where: {
        storeId_channel_phone: {
          storeId: "store-1",
          channel: "WHATSAPP",
          phone: "573001234567",
        },
      },
      create: {
        storeId: "store-1",
        channel: "WHATSAPP",
        phone: "573001234567",
        status: "OPEN",
        lastOutboundAt: new Date(1789300100 * 1000),
      },
      update: { lastOutboundAt: new Date(1789300100 * 1000) },
      select: { id: true },
    });
    // Paula contestó desde el celular: la conversación deja de esperarla.
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", status: "NEEDS_OWNER" },
      data: { status: "OPEN" },
    });
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conversation-1",
        direction: "OUTBOUND",
        sentBy: "OWNER",
        externalId: "wamid.echo1",
        body: "Claro, te confirmo",
        mediaType: null,
        status: "SENT",
        rawEventId: "event-1",
        createdAt: new Date(1789300100 * 1000),
      },
    });
    expect(mocks.runBot).not.toHaveBeenCalled();
  });

  it("does not re-file or re-answer a redelivered webhook", async () => {
    mocks.findEvent.mockResolvedValue(event());
    // Los tres wamid ya estaban archivados.
    mocks.messageFindUnique.mockResolvedValue({ id: "existing" });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      {
        processed: true,
        messages: 3,
        botOutcomes: [],
      },
    );

    expect(mocks.messageCreate).not.toHaveBeenCalled();
    // Lo importante: nada de contestar otra vez a la misma clienta.
    expect(mocks.runBot).not.toHaveBeenCalled();
  });

  it("never answers a message it cannot deduplicate", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        payload: metaPayload({
          messages: [
            { from: "573001234567", type: "text", text: { body: "hola" } },
          ],
        }),
      }),
    );

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      { botOutcomes: [] },
    );
    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messageFindUnique).not.toHaveBeenCalled();
    expect(mocks.runBot).not.toHaveBeenCalled();
  });

  it("runs the bot once per new inbound message that carries text", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.runBot.mockResolvedValue({ outcome: "replied" });

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      {
        botOutcomes: ["replied", "replied"],
      },
    );
    expect(mocks.runBot).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      phone: "573001234567",
      body: "Hola, ¿tienen stickers?",
      // Escrito a mano: no viene de ningún botón.
      interactiveReplyId: null,
      inboundMessageId: "wamid.1",
    });
  });

  it("still marks the event PROCESSED when the bot throws", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.runBot.mockRejectedValue(new Error("bot roto"));

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toMatchObject(
      { processed: true },
    );
    expect(mocks.updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });

  it("gives up when another worker claimed the event first", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.claimRow.mockResolvedValue(false);
    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "claimed_elsewhere",
    });
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it("schedules a retry with its own delay when the database fails", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.conversationUpsert.mockRejectedValue(new Error("db down"));
    const before = Date.now();

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "retry_scheduled",
    });
    const data = mocks.updateEvent.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "RETRY", lastError: "db down" });
    expect(data.nextRetryAt.getTime() - before).toBeGreaterThanOrEqual(
      2 * 60 * 1000 - 50,
    );
    expect(data.nextRetryAt.getTime() - before).toBeLessThan(
      2 * 60 * 1000 + 5_000,
    );
  });

  it("marks the event FAILED after the last attempt", async () => {
    mocks.findEvent.mockResolvedValue(
      event({
        attempts: MAX_WHATSAPP_EVENT_ATTEMPTS - 1,
        status: MarketplaceWebhookEventStatus.RETRY,
      }),
    );
    mocks.conversationUpsert.mockRejectedValue(new Error("db down"));

    await expect(processWhatsAppWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "failed",
    });
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
