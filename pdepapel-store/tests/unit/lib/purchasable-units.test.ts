import { describe, expect, it } from "vitest";

import {
  getActivePresale,
  getPurchasableUnits,
  isPresaleItem,
} from "@/lib/purchasable-units";
import type { Product } from "@/types";

const product = (overrides: Partial<Product> = {}) =>
  ({ stock: 0, ...overrides }) as Product;

const presale = (overrides: Record<string, unknown> = {}) => ({
  id: "campaign-1",
  expectedArrivalAt: "2026-12-01T00:00:00.000Z",
  unitLimit: 40,
  committedUnits: 0,
  ...overrides,
});

describe("unidades que se pueden comprar", () => {
  it("sin preventa manda el stock", () => {
    expect(getPurchasableUnits(product({ stock: 7 }))).toBe(7);
    expect(isPresaleItem(product({ stock: 7 }))).toBe(false);
  });

  it("con preventa manda el cupo, aunque la bodega esté en cero", () => {
    const item = product({
      stock: 0,
      presales: [presale({ committedUnits: 12 })] as never,
    });

    expect(getPurchasableUnits(item)).toBe(28);
    expect(isPresaleItem(item)).toBe(true);
    expect(getActivePresale(item)?.id).toBe("campaign-1");
  });

  it("el cupo lleno no se vuelve negativo", () => {
    const item = product({
      presales: [presale({ committedUnits: 45 })] as never,
    });

    expect(getPurchasableUnits(item)).toBe(0);
  });

  it("la preventa manda incluso si el producto conserva stock", () => {
    // Paula puede abrir una preventa sobre algo que aún tiene unidades: lo que
    // se vende entonces es el cupo, no la bodega.
    const item = product({
      stock: 5,
      presales: [presale({ unitLimit: 2 })] as never,
    });

    expect(getPurchasableUnits(item)).toBe(2);
  });

  it("un stock negativo no ofrece unidades", () => {
    expect(getPurchasableUnits(product({ stock: -3 }))).toBe(0);
  });
});
