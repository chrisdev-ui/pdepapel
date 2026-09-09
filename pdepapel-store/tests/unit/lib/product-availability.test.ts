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
});
