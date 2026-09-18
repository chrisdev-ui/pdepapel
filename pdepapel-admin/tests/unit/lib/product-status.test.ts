import { describe, expect, it } from "vitest";

import { getProductStatus, productStockLabel } from "@/lib/product-status";

describe("getProductStatus", () => {
  it("ranks archived over coming soon over out of stock over low stock", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(getProductStatus({ isArchived: true, stock: 0 })).toBe("archivado");
    expect(getProductStatus({ isArchived: false, stock: 0, availableAt: future })).toBe("proximamente");
    expect(getProductStatus({ isArchived: false, stock: 0 })).toBe("agotado");
    expect(getProductStatus({ isArchived: false, stock: 2 }, 5)).toBe("stock-critico");
    expect(getProductStatus({ isArchived: false, stock: 20 }, 5)).toBe("a-la-venta");
  });

  it("keeps the unit count visible for archived products", () => {
    expect(productStockLabel({ isArchived: true, stock: 4 })).toBe("Archivado · 4 und");
    expect(productStockLabel({ isArchived: false, stock: 0 })).toBe("Agotado");
    expect(productStockLabel({ isArchived: false, stock: 3 }, 5)).toBe("3 und");
  });
});
