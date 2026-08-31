import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, findUniqueMock, updateManyMock } = vi.hoisted(() => ({
  envMock: {
    GA4_API_SECRET: undefined as string | undefined,
    GA4_MEASUREMENT_ID: undefined as string | undefined,
  },
  findUniqueMock: vi.fn(),
  updateManyMock: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: envMock }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    order: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
  },
}));

import {
  buildGoogleAnalyticsPurchasePayload,
  normalizeGoogleAnalyticsClientId,
  recordPaidOrderInGoogleAnalytics,
} from "@/lib/google-analytics";

const paidOrder = {
  analyticsClientId: "123456789.987654321",
  analyticsPurchaseTrackedAt: null,
  coupon: { code: "KAWAII10" },
  id: "order-id",
  orderItems: [
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
  payment: { method: "Bold" },
  shipping: { cost: 5000 },
  status: "PAID",
  total: 41000,
};

describe("Google Analytics purchase tracking", () => {
  beforeEach(() => {
    envMock.GA4_API_SECRET = undefined;
    envMock.GA4_MEASUREMENT_ID = undefined;
    findUniqueMock.mockReset();
    updateManyMock.mockReset();
    vi.unstubAllGlobals();
  });

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

  it("skips server tracking when production credentials are not configured", async () => {
    await expect(recordPaidOrderInGoogleAnalytics("order-id")).resolves.toBe(
      "skipped",
    );
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("sends a confirmed paid purchase once and removes the temporary client ID", async () => {
    envMock.GA4_API_SECRET = "test-secret";
    envMock.GA4_MEASUREMENT_ID = "G-TEST123";
    findUniqueMock.mockResolvedValue(paidOrder);
    updateManyMock.mockResolvedValue({ count: 1 });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recordPaidOrderInGoogleAnalytics("order-id")).resolves.toBe(
      "sent",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("measurement_id=G-TEST123");
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        client_id: paidOrder.analyticsClientId,
        events: [
          expect.objectContaining({
            name: "purchase",
            params: expect.objectContaining({
              transaction_id: paidOrder.orderNumber,
              value: paidOrder.total,
            }),
          }),
        ],
      }),
    );
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        analyticsClientId: paidOrder.analyticsClientId,
        analyticsPurchaseTrackedAt: null,
        id: paidOrder.id,
      },
      data: {
        analyticsClientId: null,
        analyticsPurchaseTrackedAt: expect.any(Date),
      },
    });
  });

  it("does not resend a purchase that is already marked as tracked", async () => {
    envMock.GA4_API_SECRET = "test-secret";
    envMock.GA4_MEASUREMENT_ID = "G-TEST123";
    findUniqueMock.mockResolvedValue({
      ...paidOrder,
      analyticsPurchaseTrackedAt: new Date(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(recordPaidOrderInGoogleAnalytics("order-id")).resolves.toBe(
      "skipped",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("leaves the purchase pending when GA4 rejects the request", async () => {
    envMock.GA4_API_SECRET = "test-secret";
    envMock.GA4_MEASUREMENT_ID = "G-TEST123";
    findUniqueMock.mockResolvedValue(paidOrder);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await expect(
      recordPaidOrderInGoogleAnalytics("order-id"),
    ).rejects.toThrow("GA4 Measurement Protocol respondió 500");
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
