import { describe, expect, it } from "vitest";

import {
  MercadoLibreFinancialsPendingError,
  parseMercadoLibreOrderFinancials,
} from "@/lib/mercadolibre/order-financials";

describe("Mercado Libre order financials", () => {
  it("records only the net amount after marketplace charges, shipping, and taxes", () => {
    const financials = parseMercadoLibreOrderFinancials(
      {
        results: [
          {
            order_id: "2000017813937484",
            payment_info: [
              {
                money_release_date: "2026-08-08T12:00:00",
                money_release_status: "released",
                tax_details: [
                  {
                    tax_status: "applied",
                    original_amount: 933,
                    refunded_amount: 0,
                  },
                ],
              },
            ],
            details: [
              {
                charge_info: {
                  debited_from_operation: "YES",
                  detail_type: "CHARGE",
                  detail_sub_type: "CV",
                  detail_amount: 13_110,
                },
                marketplace_info: { marketplace: "CORE" },
              },
              {
                charge_info: {
                  debited_from_operation: "YES",
                  detail_type: "CHARGE",
                  detail_sub_type: "CXD",
                  detail_amount: 8_500,
                },
                marketplace_info: { marketplace: "SHIPPING" },
                shipping_info: { shipping_id: "123" },
              },
              {
                charge_info: {
                  debited_from_operation: "NO",
                  detail_type: "CHARGE",
                  detail_amount: 5_000,
                },
              },
            ],
          },
        ],
      },
      "2000017813937484",
      69_000,
    );

    expect(financials).toEqual({
      marketplaceFee: 13_110,
      shippingCost: 8_500,
      taxesAmount: 933,
      netAmount: 46_457,
      moneyReleaseDate: "2026-08-08T12:00:00",
      moneyReleaseStatus: "released",
    });
  });

  it("does not estimate the net amount before Mercado Libre publishes the details", () => {
    expect(() =>
      parseMercadoLibreOrderFinancials(
        { results: [] },
        "2000017813937484",
        69_000,
      ),
    ).toThrow(MercadoLibreFinancialsPendingError);
  });
});
