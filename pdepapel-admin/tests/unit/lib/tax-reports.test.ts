import { OrderType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  summarizeTaxSalesByChannel,
  taxSaleChannel,
  TAX_SALES_DATE_BASIS,
  createTaxReportPeriod,
  createTaxSalesDateFilter,
  parseTaxSalesDateBasis,
} from "@/lib/tax-reports";

describe("createTaxReportPeriod", () => {
  it("includes the complete Colombian calendar end date", () => {
    const period = createTaxReportPeriod("2025-07-01", "2025-12-31");

    expect(period.start.toISOString()).toBe("2025-07-01T05:00:00.000Z");
    expect(period.endExclusive.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });

  it("rejects an inverted or malformed period", () => {
    expect(() => createTaxReportPeriod("2025-12-31", "2025-07-01")).toThrow(
      "La fecha inicial no puede ser posterior a la fecha final",
    );
    expect(() => createTaxReportPeriod("31-12-2025", "2025-12-31")).toThrow(
      "Las fechas deben tener el formato AAAA-MM-DD",
    );
  });

  it("filters sales by the selected accounting date", () => {
    const period = createTaxReportPeriod("2025-07-01", "2025-12-31");

    expect(
      createTaxSalesDateFilter(period, TAX_SALES_DATE_BASIS.SALE_DATE),
    ).toEqual({
      createdAt: {
        gte: period.start,
        lt: period.endExclusive,
      },
    });
    expect(
      createTaxSalesDateFilter(period, TAX_SALES_DATE_BASIS.PAYMENT_DATE),
    ).toEqual({
      paidAt: {
        gte: period.start,
        lt: period.endExclusive,
      },
    });
  });

  it("defaults to the sale date and rejects invalid accounting dates", () => {
    expect(parseTaxSalesDateBasis(null)).toBe(TAX_SALES_DATE_BASIS.SALE_DATE);
    expect(() => parseTaxSalesDateBasis("otherDate")).toThrow(
      "El criterio de fecha de ventas no es válido",
    );
  });
});

describe("canales del reporte tributario", () => {
  it("separa punto de venta y feria", () => {
    expect(taxSaleChannel(OrderType.POINT_OF_SALE)).toBe("Punto de venta");
    expect(taxSaleChannel(OrderType.FESTIVAL)).toBe("Feria");
    expect(taxSaleChannel(OrderType.STANDARD)).toBe("Tienda en línea");
    expect(taxSaleChannel(OrderType.CUSTOM)).toBe("Tienda en línea");
  });

  it("da una línea por canal y conserva el total presencial (punto de venta + ferias)", () => {
    const row = (channel: "Tienda en línea" | "Punto de venta" | "Feria" | "Mercado Libre", totalAmount: number) => ({ channel, totalAmount });
    const summary = summarizeTaxSalesByChannel([
      row("Punto de venta", 10000),
      row("Punto de venta", 5000),
      row("Feria", 20000),
      row("Tienda en línea", 30000),
    ]);
    expect(summary.lines).toEqual([
      { channel: "Tienda en línea", count: 1, total: 30000 },
      { channel: "Punto de venta", count: 2, total: 15000 },
      { channel: "Feria", count: 1, total: 20000 },
      { channel: "Mercado Libre", count: 0, total: 0 },
    ]);
    expect(summary.inPerson).toEqual({ count: 3, total: 35000 });
  });
});
