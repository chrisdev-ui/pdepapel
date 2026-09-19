import { describe, expect, it } from "vitest";

import {
  classifySaleMatch,
  describeKitDeduction,
  findExactSaleCandidate,
  isExactCode,
  rankSaleCandidates,
  saleCandidateChips,
  saleCandidateToLine,
  type SaleCandidate,
} from "@/lib/sale-search";

const candidate = (overrides: Partial<SaleCandidate>): SaleCandidate => ({
  id: overrides.id ?? overrides.sku ?? "p",
  name: "Libreta",
  sku: "LIB-1",
  gtin: null,
  stock: 3,
  price: 10000,
  ...overrides,
});

/**
 * Vender: una sola búsqueda ordenada para el mostrador. El código exacto va
 * primero, luego lo que tiene unidades por nombre (más vendidos antes) y lo
 * agotado al final; solo el código exacto se agrega sin elegir.
 */
describe("sale-search · ranking", () => {
  it("matches the SKU or GTIN exactly, ignoring case, accents and spaces", () => {
    expect(isExactCode({ sku: "LIB-1", gtin: "7701234567890" }, " lib-1 ")).toBe(true);
    expect(isExactCode({ sku: "LIB-1", gtin: "7701234567890" }, "7701234567890")).toBe(true);
    expect(isExactCode({ sku: "LIB-1", gtin: null }, "LIB")).toBe(false);
    expect(isExactCode({ sku: "LIB-1", gtin: null }, "")).toBe(false);
  });

  it("classifies a query as exact code, name prefix or contains", () => {
    expect(classifySaleMatch(candidate({ sku: "LIB-1" }), "LIB-1")).toBe("codigo");
    expect(classifySaleMatch(candidate({ name: "Libreta rosa" }), "libre")).toBe("nombre");
    expect(classifySaleMatch(candidate({ name: "Mini libreta" }), "libre")).toBe("contiene");
    expect(classifySaleMatch(candidate({}), "")).toBe("contiene");
  });

  it("ranks exact code, then in-stock by match and sales, and sold-out last (finding: unranked search)", () => {
    const rows = [
      candidate({ id: "agotado", name: "Libreta agotada", sku: "LIB-9", stock: 0, soldCount: 99 }),
      candidate({ id: "contiene", name: "Mini libreta", sku: "MIN-1", soldCount: 50 }),
      candidate({ id: "nombre-pop", name: "Libreta popular", sku: "LIB-2", soldCount: 40 }),
      candidate({ id: "nombre", name: "Libreta común", sku: "LIB-3", soldCount: 1 }),
      candidate({ id: "codigo", name: "Otro nombre", sku: "libreta", soldCount: 0 }),
      candidate({ id: "codigo", name: "Duplicado del mismo id", sku: "libreta" }),
    ];
    const ranked = rankSaleCandidates(rows, "libreta");
    expect(ranked.map((row) => row.candidate.id)).toEqual(["codigo", "nombre-pop", "nombre", "contiene", "agotado"]);
    expect(ranked[0].match).toBe("codigo");
    expect(ranked.at(-1)).toMatchObject({ available: false });
  });

  it("orders the empty query by sales with sold-out last (finding: empty query = recently edited)", () => {
    const rows = [
      candidate({ id: "b", name: "B", sku: "B", soldCount: 5 }),
      candidate({ id: "z", name: "Z agotado", sku: "Z", stock: 0, soldCount: 500 }),
      candidate({ id: "a", name: "A", sku: "A", soldCount: 20 }),
    ];
    expect(rankSaleCandidates(rows, "").map((row) => row.candidate.id)).toEqual(["a", "b", "z"]);
  });

  it("finds only the exact code for Enter, camera and paired phone", () => {
    const rows = [candidate({ id: "x", sku: "ABC-1" }), candidate({ id: "y", sku: "ABC-12" })];
    expect(findExactSaleCandidate(rows, "abc-12")?.id).toBe("y");
    expect(findExactSaleCandidate(rows, "ABC")).toBeNull();
  });
});

describe("sale-search · chips, kits and lines", () => {
  it("shows colour and size, the design only when the name lacks it, and skips placeholders", () => {
    expect(saleCandidateChips(candidate({ color: { name: "Rosa" }, size: { name: "Único" }, design: { name: "Gatitos" }, name: "Libreta gatitos" }))).toEqual(["Rosa"]);
    expect(saleCandidateChips(candidate({ color: { name: "N/A" }, size: { name: "M" }, design: { name: "Fresas" }, name: "Libreta" }))).toEqual(["M", "Fresas"]);
    expect(saleCandidateChips(candidate({ isKit: true }))).toEqual(["Kit"]);
  });

  it("explains what a kit deducts", () => {
    expect(describeKitDeduction(candidate({ kitComponents: [{ quantity: 2, component: { name: "Washi" } }, { quantity: 1, component: { name: "Folder" } }] }))).toBe("Descuenta 2 × Washi, 1 × Folder");
    expect(describeKitDeduction(candidate({}))).toBeNull();
  });

  it("builds the cart line with the live offer price as before/after and the stock as the limit", () => {
    const line = saleCandidateToLine(candidate({ id: "p-1", price: 10000, offerPrice: 8000, offerLabel: "20% OFF", stock: 4, color: { name: "Azul" } }));
    expect(line).toMatchObject({ productId: "p-1", price: 8000, originalPrice: 10000, offerLabel: "20% OFF", maxQuantity: 4, chips: ["Azul"], detail: "SKU LIB-1 · 4 und" });
    const plain = saleCandidateToLine(candidate({ id: "p-2", offerPrice: 10000, isKit: true, stock: 1 }));
    expect(plain).toMatchObject({ price: 10000, originalPrice: null, offerLabel: null, detail: "SKU LIB-1 · 1 kit" });
  });
});
