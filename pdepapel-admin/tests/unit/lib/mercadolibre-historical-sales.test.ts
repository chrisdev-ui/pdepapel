import { describe, expect, it } from "vitest";

import { parseMercadoLibreHistoricalOrder } from "@/lib/mercadolibre/historical-sales";

describe("Mercado Libre historical sales", () => {
  it("parses an imported paid sale using Mercado Libre's seller custom field as SKU", () => {
    expect(
      parseMercadoLibreHistoricalOrder({
        id: 2000017813937484,
        pack_id: 2000014415856007,
        status: "paid",
        date_closed: "2026-08-07T16:41:18.000-04:00",
        total_amount: 69000,
        currency_id: "COP",
        order_items: [
          {
            quantity: 1,
            unit_price: 69000,
            item: {
              id: "MCO2018599921",
              title: "Marcadores acrílicos punta pincel x60",
              seller_custom_field: "MAR-SIM-MUL-L-L-6315",
            },
          },
        ],
      }),
    ).toMatchObject({
      externalOrderId: "2000017813937484",
      externalPackId: "2000014415856007",
      status: "paid",
      totalAmount: 69000,
      currencyId: "COP",
      items: [
        {
          externalItemId: "MCO2018599921",
          sku: "MAR-SIM-MUL-L-L-6315",
          quantity: 1,
          unitPrice: 69000,
        },
      ],
    });
  });
});
