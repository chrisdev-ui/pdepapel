import { describe, expect, it } from "vitest";

import {
  getMercadoLibreWebhookEventKey,
  parseMercadoLibreWebhookPayload,
} from "@/lib/mercadolibre/webhook";

describe("Mercado Libre webhook parsing", () => {
  it("validates a notification and uses Mercado Libre's delivery id", () => {
    const body = JSON.stringify({
      _id: "notification-id",
      topic: "orders_v2",
      resource: "/orders/2000001",
      user_id: 123,
    });

    const parsed = parseMercadoLibreWebhookPayload(body);

    expect(parsed).toMatchObject({
      topic: "orders_v2",
      resource: "/orders/2000001",
      sellerId: "123",
    });
    expect(getMercadoLibreWebhookEventKey(parsed.payload)).toBe(
      "notification-id",
    );
  });

  it("creates a deterministic fallback key for redelivered legacy payloads", () => {
    const first = { topic: "payments", resource: "/collections/1", user_id: 1 };
    const samePayloadDifferentOrder = {
      user_id: 1,
      resource: "/collections/1",
      topic: "payments",
    };

    expect(getMercadoLibreWebhookEventKey(first)).toBe(
      getMercadoLibreWebhookEventKey(samePayloadDifferentOrder),
    );
  });

  it("rejects incomplete notifications", () => {
    expect(() =>
      parseMercadoLibreWebhookPayload(
        JSON.stringify({ topic: "orders_v2", user_id: 1 }),
      ),
    ).toThrow("recurso");
  });
});
