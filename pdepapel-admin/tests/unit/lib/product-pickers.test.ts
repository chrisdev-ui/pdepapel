import { describe, expect, it } from "vitest";

import { buildIsolatedWhere, buildSelectableWhere } from "@/lib/product-pickers";

/**
 * Las reglas de los dos selectores viven en un solo sitio para que el
 * escaneo (que pregunta por un id) y la lista apliquen exactamente lo mismo.
 */
describe("kit component eligibility (selectable)", () => {
  it("never lists kits, archived products or the kit itself, and searches by name or category", () => {
    const where = buildSelectableWhere({ storeId: "store-1", query: "agenda", excludeId: "kit-1" });
    expect(where).toMatchObject({ storeId: "store-1", isArchived: false, isKit: false, NOT: { id: "kit-1" } });
    expect(where.OR).toEqual([{ name: { contains: "agenda" } }, { category: { name: { contains: "agenda" } } }]);
  });

  it("a scanned id goes through the same rules, so a kit or an archived product comes back empty", () => {
    const where = buildSelectableWhere({ storeId: "store-1", id: "p-1", excludeId: "kit-1" });
    expect(where).toEqual({ storeId: "store-1", isArchived: false, isKit: false, NOT: { id: "kit-1" }, id: "p-1", OR: undefined });
  });
});

describe("group adoption eligibility (isolated)", () => {
  it("only standalone, non-archived products; search covers name, description and SKU", () => {
    const where = buildIsolatedWhere({ storeId: "store-1", query: "CAR-1", categoryId: "all" });
    expect(where).toMatchObject({ storeId: "store-1", productGroupId: null, isArchived: false });
    expect(where.OR).toEqual([{ name: { contains: "CAR-1" } }, { description: { contains: "CAR-1" } }, { sku: { contains: "CAR-1" } }]);
    expect(where).not.toHaveProperty("categoryId");
  });

  it("a scanned id keeps the standalone rule, so a product already in another group comes back empty", () => {
    const where = buildIsolatedWhere({ storeId: "store-1", id: "p-1", categoryId: "cat-1", imageUrls: ["https://x/a.jpg"] });
    expect(where).toEqual({ storeId: "store-1", productGroupId: null, isArchived: false, id: "p-1", categoryId: "cat-1", images: { some: { url: { in: ["https://x/a.jpg"] } } } });
  });
});
