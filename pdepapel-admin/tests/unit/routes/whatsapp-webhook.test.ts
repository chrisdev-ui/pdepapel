import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  env: { WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-whatsapp-verify-token-0123456789", WHATSAPP_APP_SECRET: undefined as string | undefined },
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/whatsapp/queue", () => ({ enqueueWhatsAppWebhookEvent: mocks.enqueue }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findFirst: mocks.findFirst },
    marketplaceWebhookEvent: {
      upsert: mocks.upsert,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.eventUpdate,
    },
    ignoredContact: { findFirst: mocks.ignoredFindFirst, update: mocks.ignoredUpdate },
    store: { findFirst: mocks.storeFindFirst },
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
    await expect(response.json()).resolves.toEqual({ received: true, stored: false, topic: "messages" });
    expect(error).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
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

    const response = await post(entrante("8618858869228"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, stored: true, queued: false, ignored: true });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    // Guardado: es lo que permite deshacerlo sin haber perdido nada.
    expect(mocks.upsert).toHaveBeenCalled();
  });

  /** Los dos sentidos cuestan, así que los dos se cortan. */
  it("también corta el eco de lo que contesta Paula en ese hilo", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });

    const response = await post(eco("8618858869228"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    await expect(response.json()).resolves.toMatchObject({ queued: false, ignored: true });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("el evento se cierra para que ninguna recuperación lo retome", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });
    await post(entrante("8618858869228"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-id" },
        data: expect.objectContaining({ status: "PROCESSED", nextRetryAt: null, lastError: expect.stringContaining("IGNORADO") }),
      }),
    );
  });

  it("lleva la cuenta de lo que se dejó pasar", async () => {
    mocks.ignoredFindFirst.mockResolvedValue({ id: "ign-1" });
    await post(entrante("8618858869228"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    expect(mocks.ignoredUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ign-1" }, data: expect.objectContaining({ skippedCount: { increment: 1 } }) }),
    );
  });

  it("una clienta que no está en la lista sigue igual que siempre", async () => {
    const response = await post(entrante("573116164568"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

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

    const response = await post(entrante("573116164568"), { headers: { "x-webhook-token": VERIFY_TOKEN } });

    await expect(response.json()).resolves.toMatchObject({ queued: true });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    errores.mockRestore();
  });

  it("la lista se consulta acotada a la tienda de la conexión", async () => {
    await post(entrante("573116164568"), { headers: { "x-webhook-token": VERIFY_TOKEN } });
    expect(mocks.ignoredFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1" }) }),
    );
  });
});
