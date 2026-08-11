import { MarketplaceOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  isMercadoLibreOrderNewlyPaid,
  parseMercadoLibreOrder,
} from "@/lib/mercadolibre/order-sync";

describe("Mercado Libre order parsing", () => {
  it("normalizes a confirmed sale without trusting the webhook payload", () => {
    const order = parseMercadoLibreOrder({
      id: 2000001,
      status: "paid",
      pack_id: 3000001,
      total_amount: 35_000,
      currency_id: "COP",
      date_closed: "2026-08-07T15:30:00.000Z",
      date_last_updated: "2026-08-07T15:31:00.000Z",
      buyer: { first_name: "Ana", last_name: "Pérez" },
      shipping: { id: 4000001 },
      order_items: [
        {
          quantity: 2,
          unit_price: 17_500,
          item: {
            id: "MCO123",
            variation_id: 987,
            title: "Agenda kawaii",
            seller_sku: "AGENDA-01",
          },
        },
      ],
    });

    expect(order).toMatchObject({
      externalOrderId: "2000001",
      externalPackId: "3000001",
      status: "PAID",
      shipmentId: "4000001",
      buyerName: "Ana Pérez",
      totalAmount: 35_000,
      currencyId: "COP",
      items: [
        {
          externalItemId: "MCO123",
          externalVariationId: "987",
          quantity: 2,
          unitPrice: 17_500,
        },
      ],
    });
    expect(order.paidAt).toEqual(new Date("2026-08-07T15:30:00.000Z"));
  });

  it("keeps cancelled orders out of automatic restocking", () => {
    const order = parseMercadoLibreOrder({
      id: "2000002",
      status: "cancelled",
      order_items: [
        {
          quantity: 1,
          unit_price: 10_000,
          item: { id: "MCO124", title: "Sticker" },
        },
      ],
    });

    expect(order.status).toBe("CANCELLED");
    expect(order.paidAt).toBeNull();
  });

  it("notifies only when an order first becomes paid", () => {
    expect(
      isMercadoLibreOrderNewlyPaid(null, MarketplaceOrderStatus.PAID),
    ).toBe(true);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PENDING,
        MarketplaceOrderStatus.PAID,
      ),
    ).toBe(true);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PAID,
        MarketplaceOrderStatus.PAID,
      ),
    ).toBe(false);
    expect(
      isMercadoLibreOrderNewlyPaid(
        MarketplaceOrderStatus.PAID,
        MarketplaceOrderStatus.CANCELLED,
      ),
    ).toBe(false);
  });
});
