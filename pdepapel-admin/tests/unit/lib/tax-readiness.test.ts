import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildTaxReadiness } from "@/lib/tax-readiness";

describe("tax readiness", () => {
  it("is ready when nothing would distort the report", () => {
    expect(buildTaxReadiness({ paidWithoutDate: 0, marketplacePendingSettlement: 0, restockCompleted: 3, purchasesRegistered: 3 }, "s1", 2026)).toEqual({ year: 2026, items: [], ready: true });
  });

  it("lists each gap with where to fix it", () => {
    const result = buildTaxReadiness({ paidWithoutDate: 12, marketplacePendingSettlement: 1, restockCompleted: 5, purchasesRegistered: 2 }, "s1", 2026);
    expect(result.ready).toBe(false);
    expect(result.items.map((i) => i.id)).toEqual(["paid-without-date", "marketplace-pending", "purchases-gap"]);
    expect(result.items[0].title).toBe("12 pedidos pagados sin fecha de pago");
    expect(result.items[1].title).toBe("1 venta de Mercado Libre sin liquidación");
    expect(result.items[2].title).toBe("3 órdenes de aprovisionamiento completadas sin factura registrada");
    expect(result.items[2].href).toBe("/s1/aprovisionamiento");
  });
});
