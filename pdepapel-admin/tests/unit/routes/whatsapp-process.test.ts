import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/whatsapp/queue", () => ({
  getWhatsAppProcessorUrl: () => "https://admin.test/api/internal/marketplaces/whatsapp/process",
  verifyWhatsAppProcessorRequest: mocks.verify,
}));
vi.mock("@/lib/whatsapp/conversation-sync", () => ({
  processWhatsAppWebhookEvent: mocks.process,
}));

import { POST } from "@/app/api/internal/marketplaces/whatsapp/process/route";

function request(body: string, headers: Record<string, string> = { "upstash-signature": "sig", "upstash-region": "us-east-1" }) {
  return new Request("https://admin.test/api/internal/marketplaces/whatsapp/process", { method: "POST", body, headers });
}

describe("POST /api/internal/marketplaces/whatsapp/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.process.mockResolvedValue({ processed: true, reason: "processed", messages: 1, statuses: 0, skipped: 0 });
  });

  it("rejects a request whose QStash signature does not verify", async () => {
    mocks.verify.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ eventId: "event-1" })));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Firma de cola inválida" });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("verifies the raw body against the configured processor URL and the request headers", async () => {
    const body = JSON.stringify({ eventId: "event-1" });
    await POST(request(body));
    expect(mocks.verify).toHaveBeenCalledWith(body, "sig", "https://admin.test/api/internal/marketplaces/whatsapp/process", "us-east-1");
  });

  it("rejects a malformed or empty event id with 400", async () => {
    expect((await POST(request(JSON.stringify({})))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ eventId: 42 })))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ eventId: "" })))).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("answers 500 when the body is not JSON or the processor throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request("not json"))).status).toBe(500);
    mocks.process.mockRejectedValue(new Error("boom"));
    expect((await POST(request(JSON.stringify({ eventId: "event-1" })))).status).toBe(500);
    error.mockRestore();
  });

  it("returns the processor result, including a scheduled retry, with 200 so QStash does not re-deliver", async () => {
    mocks.process.mockResolvedValue({ processed: false, reason: "retry_scheduled" });
    const response = await POST(request(JSON.stringify({ eventId: "event-1" })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: false, reason: "retry_scheduled" });
    expect(mocks.process).toHaveBeenCalledWith("event-1");
  });
});
