import { describe, expect, it } from "vitest";

import {
  countSalesByView,
  getSaleAttention,
  getSaleNetDisplay,
  getSettlementLabel,
  isSalesView,
  saleMatchesView,
  type SalesViewOrder,
} from "@/lib/mercadolibre/sales-views";

const sale = (overrides: Partial<SalesViewOrder>): SalesViewOrder => ({
  status: "PAID",
  inventoryStatus: "DECREMENTED",
  netAmount: 46_457,
  historical: false,
  moneyReleaseStatus: null,
  ...overrides,
});

describe("Mercado Libre sales views", () => {
  it("names what is pending on each sale", () => {
    expect(getSaleAttention(sale({ inventoryStatus: "EXCEPTION" }))).toMatchObject({ kind: "resync" });
    expect(getSaleAttention(sale({ inventoryStatus: "NOT_APPLIED" }))).toMatchObject({ kind: "resync" });
    expect(getSaleAttention(sale({ status: "CANCELLED", inventoryStatus: "RESTOCK_PENDING" }))).toMatchObject({ kind: "restock" });
    expect(getSaleAttention(sale({ status: "REFUNDED", inventoryStatus: "RESTOCK_PENDING" }))).toMatchObject({ kind: "restock" });
    expect(getSaleAttention(sale({ netAmount: null }))).toMatchObject({ kind: "settlement" });
    expect(getSaleAttention(sale({ status: "PARTIALLY_REFUNDED", netAmount: null }))).toMatchObject({ kind: "settlement" });
    expect(getSaleAttention(sale({}))).toBeNull();
    expect(getSaleAttention(sale({ status: "CANCELLED", inventoryStatus: "RESTOCKED" }))).toBeNull();
    // Una venta pendiente de pago sin inventario aplicado no pide nada todavía.
    expect(getSaleAttention(sale({ status: "PENDING", inventoryStatus: "NOT_APPLIED", netAmount: null }))).toBeNull();
  });

  it("groups sales into the four views", () => {
    const sales = [
      sale({}),
      sale({ inventoryStatus: "EXCEPTION" }),
      sale({ status: "PARTIALLY_REFUNDED" }),
      sale({ status: "CANCELLED", inventoryStatus: "RESTOCK_PENDING" }),
      sale({ status: "REFUNDED", inventoryStatus: "RESTOCKED" }),
      sale({ status: "PENDING", inventoryStatus: "NOT_APPLIED", netAmount: null }),
    ];
    expect(countSalesByView(sales)).toEqual({ "por-atender": 2, pagadas: 3, devueltas: 2, todas: 6 });
    expect(saleMatchesView(sales[5], "pagadas")).toBe(false);
    expect(isSalesView("pagadas")).toBe(true);
    expect(isSalesView("otra")).toBe(false);
  });

  it("never calls a hand-typed net 'confirmed by Mercado Libre'", () => {
    expect(getSettlementLabel(sale({ historical: true }))).toBe("Neto ingresado a mano al importar la venta");
    expect(getSettlementLabel(sale({ netAmount: null }))).toBe("Liquidación pendiente de Mercado Libre");
    expect(getSettlementLabel(sale({ moneyReleaseStatus: "released" }))).toBe("Liquidación liberada por Mercado Libre");
    expect(getSettlementLabel(sale({}))).toBe("Neto confirmado por Mercado Libre");
    expect(getSettlementLabel(sale({ status: "CANCELLED" }))).toBe("Sin ingreso: la venta fue cancelada");
    expect(getSettlementLabel(sale({ status: "REFUNDED" }))).toBe("Sin ingreso: la venta fue reembolsada");
  });

  it("never shows a net for a cancelled or refunded sale, even if one was computed before", () => {
    const format = (value: number) => `$${value}`;
    expect(getSaleNetDisplay(sale({}), format)).toBe("$46457");
    expect(getSaleNetDisplay(sale({ netAmount: null }), format)).toBe("Pendiente");
    expect(getSaleNetDisplay(sale({ status: "CANCELLED", netAmount: 80_000 }), format)).toBe("—");
    expect(getSaleNetDisplay(sale({ status: "REFUNDED", netAmount: 80_000 }), format)).toBe("—");
    expect(getSaleNetDisplay(sale({ status: "PARTIALLY_REFUNDED", netAmount: 36_457 }), format)).toBe("$36457");
  });
});
