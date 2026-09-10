import { DEFAULT_LOW_STOCK_THRESHOLD, productMatchesView, resolveLowStockThreshold } from "@/lib/product-readiness";
import { parseLowStockThreshold } from "@/lib/store-settings";
import { describe, expect, it } from "vitest";

const base = {
  isArchived: false,
  name: "Libreta",
  price: 10000,
  acqPrice: 5000,
  categoryId: "cat-1",
  images: 1,
  gtin: "7701234567890",
  hasNoProductIdentifier: false,
  brokenImages: 0,
  availableAt: null,
  isKit: false,
};

describe("umbral de stock crítico por tienda", () => {
  it("usa el valor de la aplicación cuando la tienda no fijó el suyo", () => {
    expect(resolveLowStockThreshold(null)).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    expect(resolveLowStockThreshold(undefined)).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    // Un 0 guardado nunca marcaría nada: para eso está la vista "Agotados".
    expect(resolveLowStockThreshold(0)).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
  });

  it("respeta el umbral de la tienda", () => {
    expect(resolveLowStockThreshold(12)).toBe(12);
  });

  it("mueve la vista «stock crítico» con el umbral", () => {
    const product = { ...base, stock: 8 };
    expect(productMatchesView(product, "stock-critico", 5)).toBe(false);
    expect(productMatchesView(product, "stock-critico", 10)).toBe(true);
  });

  it("no marca como crítico lo que ya está agotado", () => {
    const product = { ...base, stock: 0 };
    expect(productMatchesView(product, "stock-critico", 10)).toBe(false);
    expect(productMatchesView(product, "agotados", 10)).toBe(true);
  });

  it("valida lo que se puede guardar en la tienda", () => {
    expect(parseLowStockThreshold("")).toBeNull();
    expect(parseLowStockThreshold(null)).toBeNull();
    expect(parseLowStockThreshold("8")).toBe(8);
    expect(() => parseLowStockThreshold("0")).toThrowError(/al menos 1/);
    expect(() => parseLowStockThreshold("2.5")).toThrowError(/al menos 1/);
  });
});
