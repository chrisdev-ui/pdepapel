import { describe, expect, it } from "vitest";

import { getProductAvailability } from "@/lib/product-availability";

const now = new Date("2026-09-09T12:00:00Z");

describe("getProductAvailability", () => {
  it("reads in-stock products with a count only when stock is low enough to matter", () => {
    expect(getProductAvailability({ stock: 29 }, { now })).toMatchObject({ status: "in-stock", canBuy: true, stockLabel: "En stock · quedan 29 unidades" });
    expect(getProductAvailability({ stock: 80 }, { now })).toMatchObject({ status: "in-stock", stockLabel: "En stock" });
  });

  it("flags three units or fewer as low stock", () => {
    expect(getProductAvailability({ stock: 2 }, { now })).toMatchObject({ status: "low-stock", canBuy: true, tone: "amber" });
    expect(getProductAvailability({ stock: 1 }, { now }).stockLabel).toBe("¡Última unidad disponible!");
  });

  it("turns sold-out products into a notify action", () => {
    expect(getProductAvailability({ stock: 0 }, { now })).toMatchObject({ status: "sold-out", canBuy: false, ctaLabel: "Avísame cuando vuelva" });
  });

  it("treats a future availability date as coming soon unless early access is on", () => {
    const product = { stock: 5, availableAt: "2026-10-01T00:00:00Z" };
    expect(getProductAvailability(product, { now })).toMatchObject({ status: "coming-soon", canBuy: false, ctaLabel: "Avísame cuando llegue" });
    expect(getProductAvailability(product, { now, earlyAccess: true }).status).toBe("in-stock");
  });

  it("puts archived first and groups describe their options", () => {
    expect(getProductAvailability({ stock: 0, isArchived: true }, { now }).status).toBe("archived");
    expect(getProductAvailability({ stock: 2, isGroup: true }, { now })).toMatchObject({ status: "in-stock", stockLabel: "Disponible en varias opciones" });
  });

  // 2026-11-04: los combos comparten la urna; «quedan 2» en el x15 confundía con cientos de cápsulas por vender.
  it("a capsule combo («Kits sorpresa») says only Disponible or Agotado, never a count", () => {
    const category = { id: "c", name: "Kits sorpresa", slug: "kits-sorpresa" } as never;
    for (const stock of [1, 2, 3, 15, 45]) {
      expect(getProductAvailability({ stock, category }, { now })).toMatchObject({ status: "in-stock", canBuy: true, stockLabel: "Disponible", tone: "green" });
    }
    expect(getProductAvailability({ stock: 0, category }, { now })).toMatchObject({ status: "sold-out", canBuy: false, stockLabel: "Agotado" });
    expect(getProductAvailability({ stock: 5, category, availableAt: "2026-10-01T00:00:00Z" }, { now }).status).toBe("coming-soon");
  });
});
