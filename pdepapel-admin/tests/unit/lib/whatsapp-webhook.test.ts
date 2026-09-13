import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  classifyWhatsAppWebhookEvent,
  hashWhatsAppWebhookPayload,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/webhook";

const metaMessage = (overrides: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA-123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "573132582293", phone_number_id: "PHONE-9" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "573000000000" }],
            messages: [{ from: "573000000000", id: "wamid.ABC", timestamp: "1789000000", type: "text", text: { body: "Hola" } }],
            ...overrides,
          },
        },
      ],
    },
  ],
});

describe("parseWhatsAppWebhookPayload", () => {
  it("keeps an unparsable body instead of throwing", () => {
    expect(parseWhatsAppWebhookPayload("not json")).toEqual({ _rawUnparsable: "not json" });
    expect(parseWhatsAppWebhookPayload("[1,2]")).toEqual({ _rawUnparsable: "[1,2]" });
    expect(parseWhatsAppWebhookPayload('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("classifyWhatsAppWebhookEvent", () => {
  it("reads topic, phone number, WABA and message id from Meta's native shape", () => {
    expect(classifyWhatsAppWebhookEvent(metaMessage())).toEqual({
      topic: "messages",
      resource: "PHONE-9",
      sellerId: "WABA-123",
      eventKey: "wamid.ABC",
    });
  });

  it("uses the status id when the change carries a delivery status", () => {
    const payload = metaMessage({ messages: undefined, statuses: [{ id: "wamid.STATUS", status: "delivered" }] });
    expect(classifyWhatsAppWebhookEvent(payload).eventKey).toBe("wamid.STATUS");
  });

  it("hashes the whole body when a batch carries several ids, so none is lost to deduplication", () => {
    const payload = metaMessage({ messages: [{ id: "wamid.1" }, { id: "wamid.2" }] });
    const classified = classifyWhatsAppWebhookEvent(payload);
    expect(classified.topic).toBe("messages");
    expect(classified.eventKey).toBe(hashWhatsAppWebhookPayload(payload));
    expect(classified.eventKey).toHaveLength(64);
  });

  it("falls back to the WABA as resource when there is no phone metadata", () => {
    const payload = metaMessage({ metadata: undefined });
    expect(classifyWhatsAppWebhookEvent(payload).resource).toBe("WABA-123");
  });

  it("classifies anything else as unknown with a stable hash, never throwing", () => {
    const normalized = { event: "message.received", data: { text: "hola" } };
    const first = classifyWhatsAppWebhookEvent(normalized);
    expect(first).toMatchObject({ topic: "unknown", resource: "unknown", sellerId: null });
    expect(first.eventKey).toBe(classifyWhatsAppWebhookEvent({ data: { text: "hola" }, event: "message.received" }).eventKey);
    expect(classifyWhatsAppWebhookEvent({ _rawUnparsable: "x" }).topic).toBe("unknown");
    expect(classifyWhatsAppWebhookEvent({ entry: "nope" }).topic).toBe("unknown");
  });
});

describe("verifyWhatsAppWebhookSignature", () => {
  const body = JSON.stringify(metaMessage());
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts Meta's HMAC over the raw body and rejects everything else", () => {
    expect(verifyWhatsAppWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, signature.toUpperCase(), secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body + " ", signature, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, signature, "other")).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, signature, undefined)).toBe(false);
  });
});
