import { describe, expect, it } from "vitest";

import { getListReadiness, getProductReadiness, getProductShape, productMatchesView } from "@/lib/product-readiness";

const complete = { name: "Cuaderno Snoopy A5", price: 32000, acqPrice: 18500, categoryId: "c1", images: [{ url: "a" }], gtin: "7701234567890", hasNoProductIdentifier: false, description: "<p>Cuaderno argollado de tapa dura y hojas de 90 g.</p>" };

describe("product readiness", () => {
  it("passes a complete product and lists what is missing otherwise", () => {
    expect(getProductReadiness(complete)).toMatchObject({ complete: true, done: 7, total: 7, missing: [] });
    const partial = getProductReadiness({ ...complete, images: [], gtin: "", hasNoProductIdentifier: false, description: "corto" });
    expect(partial.complete).toBe(false);
    expect(partial.missing).toEqual(["imagen", "identificador", "descripción"]);
  });

  it("rejects emoji in the name and accepts the no-identifier flag", () => {
    expect(getProductReadiness({ ...complete, name: "📒 Cuaderno" }).missing).toContain("nombre");
    expect(getProductReadiness({ ...complete, gtin: null, hasNoProductIdentifier: true }).missing).not.toContain("identificador");
  });

  it("does not require a purchase cost for kits", () => {
    expect(getProductReadiness({ ...complete, acqPrice: 0, isKit: true }).missing).not.toContain("costo");
    expect(getProductReadiness({ ...complete, acqPrice: 0 }).missing).toContain("costo");
  });

  it("skips the description check in the list and classifies shapes", () => {
    const { description: _omit, ...listProduct } = complete;
    expect(getListReadiness({ ...listProduct, images: 2 }).complete).toBe(true);
    expect(getProductShape({ isKit: true })).toEqual({ id: "kit", label: "Kit" });
    expect(getProductShape({ productGroupId: "g1" })).toEqual({ id: "variante", label: "Variante" });
    expect(getProductShape({})).toEqual({ id: "individual", label: "Individual" });
  });

  it("filters the list views", () => {
    const base = { ...complete, images: 1, isArchived: false, stock: 3 };
    expect(productMatchesView(base, "stock-critico")).toBe(true);
    expect(productMatchesView({ ...base, stock: 0 }, "agotados")).toBe(true);
    expect(productMatchesView({ ...base, gtin: "", hasNoProductIdentifier: false }, "sin-completar")).toBe(true);
    expect(productMatchesView(base, "sin-completar")).toBe(false);
    expect(productMatchesView({ ...base, isArchived: true }, "activos")).toBe(false);
    expect(productMatchesView({ ...base, isArchived: true }, "archivados")).toBe(true);
  });
});
