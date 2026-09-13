import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const VERIFY_TOKEN = "test-whatsapp-verify-token-0123456789";
const APP_SECRET = "meta-app-secret";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
  env: { WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-whatsapp-verify-token-0123456789", WHATSAPP_APP_SECRET: undefined as string | undefined },
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findFirst: mocks.findFirst },
    marketplaceWebhookEvent: { upsert: mocks.upsert },
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
            messages: [{ id: "wamid.ABC", type: "text", text: { body: "Hola" } }],
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
    await expect(response.json()).resolves.toEqual({ received: true, stored: true, eventId: "event-id", topic: "messages", connectedAccount: false });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: "WHATSAPP", sellerId: "WABA-123" } }));
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_eventKey: { provider: "WHATSAPP", eventKey: "wamid.ABC" } },
        create: expect.objectContaining({ provider: "WHATSAPP", topic: "messages", resource: "PHONE-9", sellerId: "WABA-123", connectionId: null }),
      }),
    );
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
  });

  it("still answers 200 when the database write fails, so the provider keeps the subscription", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockRejectedValue(new Error("db down"));
    const response = await post(metaBody, { url: `${BASE}?token=${VERIFY_TOKEN}` });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, stored: false, topic: "messages" });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
