import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  verify: vi.fn(),
  clientOptions: [] as unknown[],
  receiverOptions: [] as unknown[],
}));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
    publishJSON = mocks.publishJSON;
  },
  Receiver: class {
    constructor(options: unknown) {
      mocks.receiverOptions.push(options);
    }
    verify = mocks.verify;
  },
}));

import {
  WHATSAPP_PROCESSOR_PATH,
  enqueueWhatsAppWebhookEvent,
  getWhatsAppFlowControlKey,
  getWhatsAppProcessorUrl,
  getWhatsAppQueueConfigurationStatus,
  verifyWhatsAppProcessorRequest,
} from "@/lib/whatsapp/queue";

const queueEnvironment = {
  ADMIN_WEB_URL: "https://admin.papeleriapdepapel.com",
  QSTASH_TOKEN: "qstash-token",
  QSTASH_CURRENT_SIGNING_KEY: "current-signing-key",
  QSTASH_NEXT_SIGNING_KEY: "next-signing-key",
};

describe("WhatsApp durable queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientOptions.length = 0;
    mocks.receiverOptions.length = 0;
    mocks.publishJSON.mockResolvedValue({ messageId: "msg-1" });
    mocks.verify.mockResolvedValue(true);
  });

  it("reuses the Mercado Libre QStash credentials and reports what is missing", () => {
    expect(getWhatsAppQueueConfigurationStatus({})).toEqual({
      configured: false,
      missing: ["QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY", "ADMIN_WEB_URL"],
    });
    expect(getWhatsAppQueueConfigurationStatus({ ...queueEnvironment, ADMIN_WEB_URL: "  " })).toEqual({
      configured: false,
      missing: ["ADMIN_WEB_URL"],
    });
    expect(getWhatsAppQueueConfigurationStatus(queueEnvironment)).toEqual({ configured: true, missing: [] });
  });

  it("builds the signed processor endpoint from ADMIN_WEB_URL", () => {
    expect(WHATSAPP_PROCESSOR_PATH).toBe("/api/internal/marketplaces/whatsapp/process");
    expect(getWhatsAppProcessorUrl(queueEnvironment)).toBe(
      "https://admin.papeleriapdepapel.com/api/internal/marketplaces/whatsapp/process",
    );
    expect(() => getWhatsAppProcessorUrl({})).toThrow(/ADMIN_WEB_URL/);
  });

  it("serializes every event of one customer behind the same flow-control key", () => {
    expect(getWhatsAppFlowControlKey("573001234567")).toBe("whatsapp-conversation-573001234567");
    expect(getWhatsAppFlowControlKey(null)).toBe("whatsapp-conversation-unknown");
    expect(getWhatsAppFlowControlKey("  ")).toBe("whatsapp-conversation-unknown");
  });

  it("publishes the event id to the processor with retries, timeout and a redacted body", async () => {
    await expect(enqueueWhatsAppWebhookEvent("event-1", "573001234567", queueEnvironment)).resolves.toBe(true);
    expect(mocks.clientOptions).toEqual([{ token: "qstash-token", enableTelemetry: false }]);
    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: "https://admin.papeleriapdepapel.com/api/internal/marketplaces/whatsapp/process",
      body: { eventId: "event-1" },
      retries: 5,
      timeout: 50,
      flowControl: { key: "whatsapp-conversation-573001234567", parallelism: 1 },
      label: ["whatsapp", "webhook"],
      redact: { body: true },
    });
  });

  it("returns false without publishing when the queue is not configured", async () => {
    await expect(enqueueWhatsAppWebhookEvent("event-1", "573001234567", {})).resolves.toBe(false);
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it("verifies the QStash signature with both signing keys and the request URL", async () => {
    await expect(
      verifyWhatsAppProcessorRequest("body", "signature", "https://admin.test/process", "us-east-1", queueEnvironment),
    ).resolves.toBe(true);
    expect(mocks.receiverOptions).toEqual([
      { currentSigningKey: "current-signing-key", nextSigningKey: "next-signing-key" },
    ]);
    expect(mocks.verify).toHaveBeenCalledWith({
      body: "body",
      signature: "signature",
      url: "https://admin.test/process",
      upstashRegion: "us-east-1",
    });
  });

  it("rejects a request without a signature or without signing keys before calling QStash", async () => {
    await expect(verifyWhatsAppProcessorRequest("body", null, "https://admin.test", null, queueEnvironment)).resolves.toBe(false);
    await expect(verifyWhatsAppProcessorRequest("body", "signature", "https://admin.test", null, {})).resolves.toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
