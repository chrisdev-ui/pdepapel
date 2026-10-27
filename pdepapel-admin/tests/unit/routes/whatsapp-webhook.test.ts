import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const VERIFY_TOKEN = "test-whatsapp-verify-token-0123456789";
const APP_SECRET = "meta-app-secret";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  enqueue: vi.fn(),
  ignoredFindFirst: vi.fn(),
  ignoredUpdate: vi.fn(),
  eventUpdate: vi.fn(),
  storeFindFirst: vi.fn(),
  convFindUnique: vi.fn(),
  convUpdateMany: vi.fn(),
  stash: vi.fn(),
  sweep: vi.fn(),
  connectionUpdate: vi.fn(),
  commandCreate: vi.fn(),
  env: {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-whatsapp-verify-token-0123456789",
    WHATSAPP_APP_SECRET: undefined as string | undefined,
    CHAKRA_WEBHOOK_SECRET: undefined as string | undefined,
    CHAKRA_WEBHOOK_ENFORCE: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/whatsapp/queue", () => ({ enqueueWhatsAppWebhookEvent: mocks.enqueue }));
vi.mock("@/lib/whatsapp/webhook-replay", () => ({ stashFailedWhatsAppWebhook: mocks.stash }));
vi.mock("@/lib/whatsapp/recovery", () => ({ sweepWhatsAppEventsQuietly: mocks.sweep }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findFirst: mocks.findFirst, update: mocks.connectionUpdate },
    whatsAppAdminCommand: { create: mocks.commandCreate },
    marketplaceWebhookEvent: {
      upsert: mocks.upsert,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.eventUpdate,
    },
    ignoredContact: { findFirst: mocks.ignoredFindFirst, update: mocks.ignoredUpdate },
    store: { findFirst: mocks.storeFindFirst },
    conversation: { findUnique: mocks.convFindUnique, updateMany: mocks.convUpdateMany },
  },
}));

import { GET, POST } from "@/app/api/webhook/whatsapp/route";

const BASE = "https://admin.example.com/api/webhook/whatsapp";

const metaBody = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA-123",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PHONE-9" },
            messages: [{ from: "573001234567", id: "wamid.ABC", type: "text", text: { body: "Hola" } }],
          },
        },
      ],
    },
  ],
});

const post = (body: string, init: { url?: string; headers?: Record<string, string> } = {}) =>
  POST(new Request(init.url ?? BASE, { method: "POST", headers: { "content-type": "application/json", ...init.headers }, body }));

describe("GET /api/webhook/whatsapp (Meta handshake)", () => {
  it("echoes the challenge as plain text when mode and token match", async () => {
    const response = await GET(new Request(`${BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("12345");
  });

  it("answers 403 to a wrong token, a wrong mode or a missing challenge", async () => {
    expect((await GET(new Request(`${BASE}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`))).status).toBe(403);
    expect((await GET(new Request(`${BASE}?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`))).status).toBe(403);
    expect((await GET(new Request(`${BASE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`))).status).toBe(403);
  });
});

describe("POST /api/webhook/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_APP_SECRET = undefined;
    mocks.findFirst.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ id: "event-id", connectionId: null });
    mocks.enqueue.mockResolvedValue(true);
    // Por defecto no hay nadie ignorado: el camino de siempre.
    mocks.ignoredFindFirst.mockResolvedValue(null);
    mocks.ignoredUpdate.mockResolvedValue({});
    mocks.eventUpdate.mockResolvedValue({});
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
    mocks.stash.mockResolvedValue({ stashed: true, queued: true });
  });

  it("rejects a request without the shared secret before touching the database", async () => {
    const response = await post(metaBody);
    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a body over 256 KB with 413", async () => {
    const response = await post("x".repeat(256 * 1024 + 1), { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(413);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores a Meta-shaped event keyed by the message id when the token is in the URL", async () => {
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    // `ignored: false` es nuevo: la respuesta ahora dice también si el
    // contacto está en la lista, para poder verlo desde fuera.
    await expect(response.json()).resolves.toEqual({ received: true, stored: true, eventId: "event-id", topic: "messages", connectedAccount: false, queued: true, ignored: false });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: "WHATSAPP", sellerId: "WABA-123" } }));
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_eventKey: { provider: "WHATSAPP", eventKey: "wamid.ABC" } },
        create: expect.objectContaining({ provider: "WHATSAPP", topic: "messages", resource: "PHONE-9", sellerId: "WABA-123", connectionId: null }),
      }),
    );
  });

  it("enqueues the stored event behind the customer's phone lane", async () => {
    await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(mocks.enqueue).toHaveBeenCalledWith("event-id", "573001234567");
  });

  it("con el evento ya guardado, dispara la recuperación de paso", async () => {
    mocks.sweep.mockResolvedValue(undefined);
    await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
  });

  it("una recuperación que no termina no demora la respuesta", async () => {
    mocks.sweep.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(response.json()).resolves.toMatchObject({ stored: true, queued: true });
  });

  it("una recuperación que falla no tumba la respuesta ni el encolado", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sweep.mockRejectedValue(new Error("boom"));
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stored: true, queued: true });
    expect(mocks.enqueue).toHaveBeenCalledWith("event-id", "573001234567");
    error.mockRestore();
  });

  it("still answers 200 with stored: true when the queue is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.enqueue.mockRejectedValue(new Error("qstash down"));
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stored: true, queued: false });
    expect(error).toHaveBeenCalledWith("[WHATSAPP_WEBHOOK] No se pudo encolar el evento", expect.objectContaining({ eventId: "event-id" }));
    error.mockRestore();
  });

  it("accepts the token in the header and links the connection when the WABA is known", async () => {
    mocks.findFirst.mockResolvedValue({ id: "connection-id" });
    mocks.upsert.mockResolvedValue({ id: "event-id", connectionId: "connection-id" });
    const response = await post(metaBody, { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ connectedAccount: true });
    expect(mocks.upsert.mock.calls[0][0].create.connectionId).toBe("connection-id");
  });

  it("accepts Meta's signature instead of the token only when the app secret is configured", async () => {
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(metaBody).digest("hex")}`;
    expect((await post(metaBody, { headers: { "x-hub-signature-256": signature } })).status).toBe(401);
    mocks.env.WHATSAPP_APP_SECRET = APP_SECRET;
    expect((await post(metaBody, { headers: { "x-hub-signature-256": signature } })).status).toBe(200);
    expect((await post(metaBody, { headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } })).status).toBe(401);
  });

  it("stores an unrecognized or unparsable body as unknown instead of rejecting it", async () => {
    const response = await post("not json at all", { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    const create = mocks.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({ topic: "unknown", resource: "unknown", sellerId: null, payload: { _rawUnparsable: "not json at all" } });
    expect(create.eventKey).toHaveLength(64);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith("event-id", null);
  });

  it("treats a concurrent duplicate delivery as saved instead of as a failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // Dos entregas del mismo evento a la vez: esta pierde la carrera contra la
    // restricción única, pero la fila ya existe gracias a su gemela.
    const { Prisma } = await import("@prisma/client");
    mocks.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.1",
      }),
    );
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "event-id", connectionId: "connection-id" });

    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ stored: true, eventId: "event-id", connectedAccount: true });
    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { provider_eventKey: { provider: "WHATSAPP", eventKey: "wamid.ABC" } },
      select: { id: true, connectionId: true },
    });
    // La fila recuperada se encola igual: el evento no se pierde.
    expect(mocks.enqueue).toHaveBeenCalledWith("event-id", "573001234567");
    // Y no se reporta como fallo de guardado.
    expect(error).not.toHaveBeenCalledWith(
      "[WHATSAPP_WEBHOOK] No se pudo guardar el evento",
      expect.anything(),
    );
    error.mockRestore();
  });

  it("still answers 200 when the database write fails, so the provider keeps the subscription", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockRejectedValue(new Error("db down"));
    mocks.findUniqueOrThrow.mockRejectedValue(new Error("db down"));
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, stored: false, topic: "messages", retryQueued: true });
    expect(error).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    // El cuerpo verificado se guarda aparte para reintentarlo: Meta no reenvía.
    expect(mocks.stash).toHaveBeenCalledWith({ eventKey: "wamid.ABC", body: metaBody });
    error.mockRestore();
  });
});

/**
 * El corte de los contactos ignorados.
 *
 * Va antes de encolar porque la cuota de QStash se gasta al publicar, no al
 * procesar: cortar más adelante ya la habría pagado. Lo que se comprueba aquí
 * es justo eso —que no se publica— y que el evento crudo sí queda guardado,
 * que es lo que hace reversible la decisión.
 */
describe("POST /api/webhook/whatsapp · contacto ignorado", () => {
  const entrante = (from: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA-123", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PHONE-9" }, messages: [{ from, id: "wamid.IN", type: "text", text: { body: "hola" } }] } }] }],
    });

  /** El eco de lo que Paula contesta desde su celular: también cuesta cuota. */
  const eco = (to: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA-123", changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: "PHONE-9" }, message_echoes: [{ to, id: "wamid.ECHO", type: "text", text: { body: "ya te cuento" } }] } }] }],
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_APP_SECRET = undefined;
    mocks.findFirst.mockResolvedValue({ id: "conn-1", storeId: "store-1" });
    mocks.upsert.mockResolvedValue({ id: "event-id", connectionId: "conn-1" });
    mocks.enqueue.mockResolvedValue(true);
    mocks.ignoredFindFirst.mockResolvedValue(null);
    mocks.ignoredUpdate.mockResolvedValue({});
    mocks.eventUpdate.mockResolvedValue({});
    mocks.storeFindFirst.mockResolvedValue({ id: "store-1" });
  });

  it("un contacto ignorado no gasta cuota, pero su evento sí se guarda", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });

    const response = await post(entrante("8613800000000"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, stored: true, queued: false, ignored: true });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    // Guardado: es lo que permite deshacerlo sin haber perdido nada.
    expect(mocks.upsert).toHaveBeenCalled();
  });

  /** Los dos sentidos cuestan, así que los dos se cortan. */
  it("también corta el eco de lo que contesta Paula en ese hilo", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });

    const response = await post(eco("8613800000000"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    await expect(response.json()).resolves.toMatchObject({ queued: false, ignored: true });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("el evento se cierra para que ninguna recuperación lo retome", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });
    await post(entrante("8613800000000"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-id" },
        data: expect.objectContaining({ status: "PROCESSED", nextRetryAt: null, lastError: expect.stringContaining("IGNORADO") }),
      }),
    );
  });

  it("lleva la cuenta de lo que se dejó pasar", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });
    await post(entrante("8613800000000"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(mocks.ignoredUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ign-1" }, data: expect.objectContaining({ skippedCount: { increment: 1 } }) }),
    );
  });

  it("una clienta que no está en la lista sigue igual que siempre", async () => {
    const response = await post(entrante("573112223344"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    await expect(response.json()).resolves.toMatchObject({ queued: true, ignored: false });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  /**
   * Si la comprobación revienta se encola igual. Encolar de más se recupera;
   * dejar a una clienta sin atender por un fallo de la lista, no.
   */
  it("si no se puede consultar la lista, se encola como siempre", async () => {
    mocks.ignoredFindFirst.mockRejectedValue(new Error("base caída"));
    const errores = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post(entrante("573112223344"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    await expect(response.json()).resolves.toMatchObject({ queued: true });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    errores.mockRestore();
  });

  it("la lista se consulta acotada a la tienda de la conexión", async () => {
    await post(entrante("573112223344"), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(mocks.ignoredFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1" }) }),
    );
  });
});

/**
 * El eco de Paula marca `lastOwnerAt` AQUÍ, al recibirlo, antes de encolar.
 *
 * Reproduce el 2026-09-24 (conversación 98ee6263): cuatro mensajes de la
 * clienta ya estaban en la fila, de a uno y en orden, y cada uno retenía el
 * turno mientras corría el bot. El eco llegó al webhook 1,7 s antes del
 * primer envío del bot, pero como solo lo escribía la fila, `shouldStayQuiet`
 * lo releyó vacío. Ahora la marca está puesta en cuanto se recibe: cuando la
 * fila llega al primer mensaje de la ráfaga, el freno ya la ve.
 */
describe("POST /api/webhook/whatsapp — eco de Paula", () => {
  const ECO_TS = 1790291407; // 2026-09-24T23:10:07Z, el «Hola buen día» real
  const echoBody = (timestamp = ECO_TS) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA-123",
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "PHONE-9" },
                message_echoes: [
                  {
                    from: "573132582293",
                    to: "573003179332",
                    to_user_id: "CO.1545049727288623",
                    id: "wamid.ECO",
                    timestamp: String(timestamp),
                    type: "text",
                    text: { body: "Hola buen día" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_APP_SECRET = undefined;
    mocks.findFirst.mockResolvedValue({ id: "conn-1", storeId: "store-1" });
    mocks.upsert.mockResolvedValue({ id: "event-eco", connectionId: "conn-1" });
    mocks.ignoredFindFirst.mockResolvedValue(null);
    mocks.enqueue.mockResolvedValue(true);
    mocks.convFindUnique.mockResolvedValue({ id: "conv-98ee6263" });
    mocks.convUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("marca lastOwnerAt con la hora del eco, y lo hace ANTES de encolar", async () => {
    const response = await post(echoBody(), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(response.status).toBe(200);

    expect(mocks.convUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.convUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "conv-98ee6263",
        OR: [{ lastOwnerAt: null }, { lastOwnerAt: { lt: new Date(ECO_TS * 1000) } }],
      },
      data: { lastOwnerAt: new Date(ECO_TS * 1000) },
    });
    // Lo que cierra el hueco: la marca queda puesta sin esperar a la fila.
    expect(mocks.convUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0],
    );
    // Y se resuelve por BSUID, que es la identidad que no se pierde.
    expect(mocks.convFindUnique.mock.calls[0][0].where).toEqual({
      storeId_channel_bsuid: { storeId: "store-1", channel: "WHATSAPP", bsuid: "CO.1545049727288623" },
    });
  });

  it("un mensaje de la clienta no toca lastOwnerAt", async () => {
    await post(metaBody, { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(mocks.convUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("si marcar falla, el evento se encola igual: la fila lo escribirá después", async () => {
    mocks.convUpdateMany.mockRejectedValue(new Error("base caída"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post(echoBody(), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(response.status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("sin conversación todavía no crea nada: la fila sigue siendo quien la crea", async () => {
    mocks.convFindUnique.mockResolvedValue(null);
    await post(echoBody(), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(mocks.convUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("if even the retry copy cannot be saved, still answers 200 and says so", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockRejectedValue(new Error("db down"));
    mocks.stash.mockRejectedValue(new Error("redis down"));
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, stored: false, topic: "messages", retryQueued: false });
    error.mockRestore();
  });

  it("does not keep a copy of a request that failed authentication", async () => {
    const response = await post(metaBody);
    expect(response.status).toBe(401);
    expect(mocks.stash).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhook/whatsapp — firma de Chakra y chat consigo misma", () => {
  const CHAKRA_SECRET = "chakra-test-secret";
  const BUSINESS = "573009999999";
  const sign = (raw: string) => createHmac("sha256", CHAKRA_SECRET).update(raw).digest("hex");
  const selfEchoBody = (text: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA-123",
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "PHONE-9", display_phone_number: "+57 300 9999999" },
                message_echoes: [
                  { from: BUSINESS, to: BUSINESS, to_user_id: "CO.7000000000000001", id: "wamid.SELF", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } },
                ],
              },
            },
          ],
        },
      ],
    });

  let info: MockInstance<(...args: unknown[]) => void>;
  let warn: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_APP_SECRET = undefined;
    mocks.env.CHAKRA_WEBHOOK_SECRET = CHAKRA_SECRET;
    mocks.env.CHAKRA_WEBHOOK_ENFORCE = "true";
    mocks.findFirst.mockResolvedValue({ id: "conn-1", storeId: "store-1", selfPhone: null, selfBsuid: null });
    mocks.upsert.mockResolvedValue({ id: "event-self", connectionId: "conn-1" });
    mocks.ignoredFindFirst.mockResolvedValue(null);
    mocks.enqueue.mockResolvedValue(true);
    mocks.eventUpdate.mockResolvedValue({});
    mocks.connectionUpdate.mockResolvedValue({});
    mocks.commandCreate.mockResolvedValue({});
    info = vi.spyOn(console, "info").mockImplementation(() => {}) as unknown as MockInstance<(...args: unknown[]) => void>;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as MockInstance<(...args: unknown[]) => void>;
  });

  afterEach(() => {
    info.mockRestore();
    warn.mockRestore();
    mocks.env.CHAKRA_WEBHOOK_SECRET = undefined;
    mocks.env.CHAKRA_WEBHOOK_ENFORCE = undefined;
  });

  const authLog = () => info.mock.calls.find((call: unknown[]) => call[0] === "[WHATSAPP_WEBHOOK] auth")?.[1];

  it("con el secreto y ENFORCE, un cuerpo falsificado con el token pero sin firma se rechaza sin tocar la base", async () => {
    const response = await post(selfEchoBody("/estado ORD-1"), { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.commandCreate).not.toHaveBeenCalled();
    expect(authLog()).toEqual({ method: "rejected", tokenVia: "query", chakraSignature: "absent", chakra: "chakra_hmac_missing", enforce: true });
  });

  it("una firma de Chakra inválida se rechaza aunque el token sea bueno", async () => {
    const response = await post(metaBody, { headers: { "x-webhook-token": VERIFY_TOKEN, "x-chakra-signature-256": "0".repeat(64) } });
    expect(response.status).toBe(401);
    expect(authLog()).toEqual({ method: "rejected", tokenVia: "header", chakraSignature: "present", chakra: "chakra_hmac_invalid", enforce: true });
  });

  it("acepta la firma de Chakra (hex sin prefijo) y el registro solo dice el método, nunca valores", async () => {
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}`, headers: { "x-chakra-signature-256": sign(metaBody) } });
    expect(response.status).toBe(200);
    expect(authLog()).toEqual({ method: "chakra_hmac", tokenVia: "query", chakraSignature: "present", chakra: "chakra_hmac_valid", enforce: true });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain(VERIFY_TOKEN);
    expect(logged).not.toContain(CHAKRA_SECRET);
    expect(logged).not.toContain(sign(metaBody));
  });

  it("sin el secreto sigue aceptando el token como hoy, dice por dónde llegó y avisa una sola vez", async () => {
    mocks.env.CHAKRA_WEBHOOK_SECRET = undefined;
    expect((await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` })).status).toBe(200);
    expect(authLog()).toEqual({ method: "token_query", tokenVia: "query", chakraSignature: "absent", chakra: "not_configured", enforce: false });
    info.mockClear();
    expect((await post(metaBody, { headers: { "x-webhook-token": VERIFY_TOKEN } })).status).toBe(200);
    expect(authLog()).toEqual({ method: "token_header", tokenVia: "header", chakraSignature: "absent", chakra: "not_configured", enforce: false });
    const missing = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes("CHAKRA_WEBHOOK_SECRET"));
    expect(missing.length).toBeLessThanOrEqual(1);
  });

  it("firmado: guarda el comando, aprende el número del negocio y lo encola en la fila propia", async () => {
    const raw = selfEchoBody("/ayuda");
    const response = await post(raw, { headers: { "x-chakra-signature-256": sign(raw) } });
    expect(response.status).toBe(200);
    expect(mocks.commandCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: "store-1", echoId: "wamid.SELF", command: "ayuda", args: null }) });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn-1" }, data: { selfPhone: BUSINESS, selfBsuid: "CO.7000000000000001" } });
    expect(mocks.enqueue).toHaveBeenCalledWith("event-self", "self-store-1");
    // Nunca toca la conversación (no marca lastOwnerAt del propio número).
    expect(mocks.convUpdateMany).not.toHaveBeenCalled();
  });

  it("con el secreto y sin ENFORCE: nada se rechaza por la firma, solo se anota", async () => {
    mocks.env.CHAKRA_WEBHOOK_ENFORCE = undefined;
    // Sin firma.
    expect((await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` })).status).toBe(200);
    expect(authLog()).toEqual({ method: "token_query", tokenVia: "query", chakraSignature: "absent", chakra: "chakra_hmac_missing", enforce: false });
    // Firma que no coincide (secreto distinto en Chakra).
    info.mockClear();
    expect((await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}`, headers: { "x-chakra-signature-256": "0".repeat(64) } })).status).toBe(200);
    expect(authLog()).toEqual({ method: "token_query", tokenVia: "query", chakraSignature: "present", chakra: "chakra_hmac_invalid", enforce: false });
    // Firma buena.
    info.mockClear();
    expect((await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}`, headers: { "x-chakra-signature-256": sign(metaBody) } })).status).toBe(200);
    expect(authLog()).toEqual({ method: "chakra_hmac", tokenVia: "query", chakraSignature: "present", chakra: "chakra_hmac_valid", enforce: false });
    // Sin token ni firma: rechazado, como hoy.
    expect((await post(metaBody)).status).toBe(401);
  });

  it("sin ENFORCE, un comando con firma inválida no se guarda (solo lo firmado corre)", async () => {
    mocks.env.CHAKRA_WEBHOOK_ENFORCE = undefined;
    const response = await post(selfEchoBody("/ayuda"), { headers: { "x-webhook-token": VERIFY_TOKEN, "x-chakra-signature-256": "0".repeat(64) } });
    expect(response.status).toBe(200);
    expect(mocks.commandCreate).not.toHaveBeenCalled();
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("sin firma (solo token): no guarda comando ni aprende nada, y cierra el evento sin encolar", async () => {
    mocks.env.CHAKRA_WEBHOOK_SECRET = undefined;
    const response = await post(selfEchoBody("/ayuda"), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ queued: false, selfChat: true });
    expect(mocks.commandCreate).not.toHaveBeenCalled();
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.eventUpdate.mock.calls[0][0].data).toMatchObject({ status: "PROCESSED" });
  });
});
