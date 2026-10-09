import { describe, expect, it } from "vitest";

import {
  MercadoLibreFinancialsPendingError,
  parseMercadoLibreOrderFinancials,
} from "@/lib/mercadolibre/order-financials";

describe("Mercado Libre order financials", () => {
  it("la comisión no se cuenta como envío aunque Mercado Libre le ponga shipping_info (respuesta real, 2026-10-09)", () => {
    const line = (subType: string, marketplace: string, amount: number) => ({
      charge_info: { debited_from_operation: "YES", detail_type: "CHARGE", detail_sub_type: subType, detail_amount: amount },
      marketplace_info: { marketplace },
      shipping_info: { shipping_id: "999" },
    });
    const financials = parseMercadoLibreOrderFinancials(
      { results: [{ order_id: "1", payment_info: [], details: [line("CV", "CORE", 16_000), line("CXD", "SHIPPING", 8_200)] }] },
      "1",
      80_000,
    );
    expect(financials).toMatchObject({ marketplaceFee: 16_000, shippingCost: 8_200, netAmount: 55_800 });
  });

  it("una venta cancelada y reembolsada queda en neto 0: los cargos no aplican y el reembolso no es ingreso", () => {
    const line = (type: string, subType: string, marketplace: string, amount: number) => ({
      charge_info: { debited_from_operation: "INAPPLICABLE", detail_type: type, detail_sub_type: subType, detail_amount: amount },
      marketplace_info: { marketplace },
      shipping_info: { shipping_id: "999" },
    });
    const financials = parseMercadoLibreOrderFinancials(
      {
        results: [
          {
            order_id: "2",
            payment_info: [],
            details: [line("CHARGE", "CV", "CORE", 16_000), line("CHARGE", "CXD", "SHIPPING", 8_200), line("BONUS", "BV", "CORE", 16_000), line("BONUS", "BXD", "SHIPPING", 8_200)],
          },
        ],
      },
      "2",
      80_000,
      80_000,
    );
    expect(financials).toMatchObject({ marketplaceFee: 0, shippingCost: 0, netAmount: 0 });
  });

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

  it("subtracts what Mercado Libre already refunded to the buyer and never goes below zero", () => {
    const partial = parseMercadoLibreOrderFinancials(
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
      10_000,
    );
    expect(partial.netAmount).toBe(36_457);

    const full = parseMercadoLibreOrderFinancials(
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
      69_000,
    );
    expect(full.netAmount).toBe(0);
    expect(full.marketplaceFee).toBe(13_110);
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
