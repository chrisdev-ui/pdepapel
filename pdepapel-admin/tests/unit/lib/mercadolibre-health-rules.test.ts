import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import {
  inventoryExceptionWhere,
  isStockAtRisk,
  isWorkableListing,
} from "@/lib/mercadolibre/health";

/**
 * #8: las seis alertas del aviso del 2026-10-07 y por qué ninguna pedía
 * nada. Cada caso es uno de los reales.
 */
type Listing = Parameters<typeof isStockAtRisk>[0];
const listing = (over: Omit<Partial<Listing>, "product"> & { product?: Partial<Listing["product"]> } = {}): Listing => ({
  status: "ACTIVE",
  stockSafetyBuffer: 0,
  lastSyncedStock: 0,
  ...over,
  product: { stock: 0, isArchived: false, ...over.product },
});

describe("stock at risk", () => {
  it("Owala negro/rojo/lila: archived product, zero already on Mercado Libre → no alert", () => {
    expect(isStockAtRisk(listing({ product: { stock: 0, isArchived: true } }))).toBe(false);
  });

  it("Taza conejo naranja: zero already pushed (Mercado Libre paused it itself) → no alert", () => {
    expect(isStockAtRisk(listing({ lastSyncedStock: 0 }))).toBe(false);
  });

  it("alerts when the zero has not reached Mercado Libre yet", () => {
    expect(isStockAtRisk(listing({ lastSyncedStock: 3 }))).toBe(true);
    expect(isStockAtRisk(listing({ lastSyncedStock: null }))).toBe(true);
  });

  it("alerts when units exist but the safety buffer hides all of them", () => {
    expect(isStockAtRisk(listing({ stockSafetyBuffer: 2, lastSyncedStock: 0, product: { stock: 2 } }))).toBe(true);
  });

  it("does not alert with stock above the buffer, or for a listing that is not active", () => {
    expect(isStockAtRisk(listing({ stockSafetyBuffer: 1, product: { stock: 5 } }))).toBe(false);
    expect(isStockAtRisk(listing({ status: "PAUSED", lastSyncedStock: 4 }))).toBe(false);
  });
});

describe("workable listing (incomplete, error, margin)", () => {
  it("Graficolors: paused listing of an archived product → not workable", () => {
    expect(isWorkableListing(listing({ status: "PAUSED", product: { isArchived: true } }))).toBe(false);
  });

  it("paused, closed or unlinked listings are not asked to be completed", () => {
    for (const status of ["PAUSED", "CLOSED", "UNLINKED"] as const) {
      expect(isWorkableListing(listing({ status }))).toBe(false);
    }
  });

  it("drafts, active and errored listings of live products still are", () => {
    for (const status of ["DRAFT", "ACTIVE", "ERROR"] as const) {
      expect(isWorkableListing(listing({ status }))).toBe(true);
    }
    expect(isWorkableListing(listing({ status: "ACTIVE", product: { isArchived: true } }))).toBe(false);
  });
});

describe("sales with inventory to resolve", () => {
  it("only an EXCEPTION on a paid sale or a pending return on a cancelled/refunded one", () => {
    expect(inventoryExceptionWhere("conn-1")).toEqual({
      connectionId: "conn-1",
      OR: [
        { inventoryStatus: "EXCEPTION", status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
        { inventoryStatus: "RESTOCK_PENDING", status: { in: ["CANCELLED", "REFUNDED"] } },
      ],
    });
  });
});
