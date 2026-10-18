import { describe, expect, it } from "vitest";

import { mercadoLibreBrandName } from "@/lib/mercadolibre/brand";

describe("BRAND de Mercado Libre", () => {
  it("usa la marca enlazada (también oculta) y la del grupo", () => {
    expect(mercadoLibreBrandName({ brand: "Texto viejo", brandRef: { name: "Enlazada", isArchived: false } })).toBe("Enlazada");
    expect(mercadoLibreBrandName({ brandRef: null, productGroup: { brandRef: { name: "Del grupo", isArchived: false } } })).toBe("Del grupo");
  });

  it("una marca archivada no viaja, tampoco su texto viejo", () => {
    expect(mercadoLibreBrandName({ brand: "Texto viejo", brandRef: { name: "Archivada", isArchived: true } })).toBeNull();
  });

  it("sin marca enlazada usa el texto anterior mientras dure la migración", () => {
    expect(mercadoLibreBrandName({ brand: "  Texto viejo ", brandRef: null })).toBe("Texto viejo");
    expect(mercadoLibreBrandName({ brand: null, brandRef: null, productGroup: { brand: "Del grupo viejo" } })).toBe("Del grupo viejo");
    expect(mercadoLibreBrandName({ brand: "", brandRef: null })).toBeNull();
  });
});
