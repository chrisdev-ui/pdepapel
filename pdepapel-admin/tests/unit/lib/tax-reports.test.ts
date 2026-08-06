import { describe, expect, it } from "vitest";

import {
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
