import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import {
  buildGoogleAnalyticsPurchasePayload,
  normalizeGoogleAnalyticsClientId,
} from "@/lib/google-analytics";

describe("Google Analytics purchase tracking", () => {
  it("accepts only GA4 browser client IDs", () => {
    expect(normalizeGoogleAnalyticsClientId("123456789.987654321")).toBe(
      "123456789.987654321",
    );
    expect(normalizeGoogleAnalyticsClientId("GA1.1.123.456")).toBeNull();
    expect(normalizeGoogleAnalyticsClientId("not-a-client-id")).toBeNull();
    expect(normalizeGoogleAnalyticsClientId(null)).toBeNull();
  });

  it("builds a purchase payload without customer data", () => {
    const payload = buildGoogleAnalyticsPurchasePayload({
      clientId: "123456789.987654321",
      couponCode: "KAWAII10",
      items: [
        {
          name: "Agenda floral",
          price: 18000,
          product: {
            brand: "P de Papel",
            category: { name: "Agendas" },
            sku: "AGENDA-001",
          },
          productId: "product-id",
          quantity: 2,
          sku: "AGENDA-001",
        },
      ],
      orderNumber: "ORD-123",
      paymentMethod: "Bold",
      shippingCost: 5000,
      total: 41000,
    });

    expect(payload).toEqual({
      client_id: "123456789.987654321",
      events: [
        {
          name: "purchase",
          params: {
            coupon: "KAWAII10",
            currency: "COP",
            engagement_time_msec: 1,
            items: [
              {
                item_brand: "P de Papel",
                item_category: "Agendas",
                item_id: "AGENDA-001",
                item_name: "Agenda floral",
                price: 18000,
                quantity: 2,
              },
            ],
            payment_type: "Bold",
            shipping: 5000,
            transaction_id: "ORD-123",
            value: 41000,
          },
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("@example.com");
  });
});
