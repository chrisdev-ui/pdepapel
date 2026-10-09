import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  replay: vi.fn(),
  ingest: vi.fn(),
}));

vi.mock("@/lib/whatsapp/queue", () => ({ verifyWhatsAppProcessorRequest: mocks.verify }));
vi.mock("@/lib/whatsapp/webhook-intake", () => ({ ingestWhatsAppWebhook: mocks.ingest }));
vi.mock("@/lib/whatsapp/webhook-replay", () => ({
  WHATSAPP_REPLAY_PREFIX: "whatsapp:webhook:replay:",
  getWhatsAppReplayUrl: () => "https://admin.test/api/internal/marketplaces/whatsapp/replay",
  replayStashedWhatsAppWebhook: mocks.replay,
}));

import { POST } from "@/app/api/internal/marketplaces/whatsapp/replay/route";

const KEY = "whatsapp:webhook:replay:0123456789abcdef0123456789abcdef";
const request = (body: string) =>
  new Request("https://admin.test/api/internal/marketplaces/whatsapp/replay", {
    method: "POST",
    body,
    headers: { "upstash-signature": "sig", "upstash-region": "us-east-1" },
  });

describe("POST /api/internal/marketplaces/whatsapp/replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.replay.mockResolvedValue({ status: "stored", eventId: "event-1" });
  });

  it("solo acepta mensajes firmados por QStash para esta URL", async () => {
    mocks.verify.mockResolvedValue(false);
    const body = JSON.stringify({ key: KEY });
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith(body, "sig", "https://admin.test/api/internal/marketplaces/whatsapp/replay", "us-east-1");
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("solo toca llaves de la cola de reintento", async () => {
    expect((await POST(request(JSON.stringify({ key: "otra:cosa" })))).status).toBe(400);
    expect((await POST(request(JSON.stringify({})))).status).toBe(400);
    expect(mocks.replay).not.toHaveBeenCalled();
  });

  it("vuelve a pasar el cuerpo por la misma entrada del webhook", async () => {
    const response = await POST(request(JSON.stringify({ key: KEY })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "stored", eventId: "event-1" });
    expect(mocks.replay).toHaveBeenCalledWith(KEY, mocks.ingest);
  });

  it("si la base sigue caída responde 500 para que QStash reintente", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.replay.mockRejectedValue(new Error("Can't reach database server"));
    expect((await POST(request(JSON.stringify({ key: KEY })))).status).toBe(500);
    error.mockRestore();
  });
});
