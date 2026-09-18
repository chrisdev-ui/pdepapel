import { describe, expect, it } from "vitest";

import { partitionForBulk, productsToCsv } from "@/lib/product-bulk";

const row = (overrides: Partial<Parameters<typeof partitionForBulk>[0][number]> = {}) => ({
  id: "1",
  name: "Cartuchera",
  sku: "CAR-1",
  isArchived: false,
  isFeatured: false,
  gtin: null,
  mpn: null,
  hasNoProductIdentifier: false,
  availableAt: null,
  ...overrides,
});

describe("partitionForBulk", () => {
  it("never wipes a real GTIN when marking products without identifier", () => {
    const withCode = row({ id: "2", gtin: "7701234567897" });
    const marked = row({ id: "3", hasNoProductIdentifier: true });
    const result = partitionForBulk([row(), withCode, marked], "mark-no-identifier");
    expect(result.eligible.map((r) => r.id)).toEqual(["1"]);
    expect(result.skipped.map((s) => s.reason)).toEqual(["Tiene GTIN 7701234567897; se conserva", "Ya está marcado"]);
  });

  it("skips rows already in the target state for archive and feature", () => {
    expect(partitionForBulk([row({ isArchived: true })], "archive").skipped[0].reason).toBe("Ya está archivado");
    expect(partitionForBulk([row()], "restore").skipped[0].reason).toBe("Ya está a la venta");
    expect(partitionForBulk([row({ isFeatured: true })], "feature").eligible).toHaveLength(0);
    expect(partitionForBulk([row()], "available-now").skipped[0].reason).toBe("Ya se vende");
  });
});

describe("productsToCsv", () => {
  it("quotes commas and marks products without code", () => {
    const csv = productsToCsv(
      [{ ...row({ name: "Libreta, A5", hasNoProductIdentifier: true }), price: 12000, stock: 3, category: { name: "Libretas" }, productGroup: null }],
      (v) => `$ ${v}`,
    );
    expect(csv.split("\n")[0]).toBe("SKU,Nombre,Subcategoría,Grupo,Precio,Stock,GTIN,Estado");
    expect(csv.split("\n")[1]).toBe('CAR-1,"Libreta, A5",Libretas,,$ 12000,3,Sin código,A la venta');
  });
});
