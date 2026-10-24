import { beforeEach, describe, expect, it, vi } from "vitest";

/** «Margen bajo» muestra costos: sin ser la dueña no se carga nada. */
const mocks = vi.hoisted(() => ({
  requireStoreOwner: vi.fn(),
  loadLowMargin: vi.fn(),
  getActiveOffers: vi.fn(),
}));

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));
vi.mock("@/lib/low-margin-list", () => ({ loadLowMargin: mocks.loadLowMargin, parseLowMarginQuery: () => ({ section: null, page: 1 }) }));
vi.mock("@/lib/discount-engine", () => ({ getActiveOffers: mocks.getActiveOffers }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/productos/margen-bajo/components/low-margin-view", () => ({ LowMarginView: () => null }));

import LowMarginPage from "@/app/(dashboard)/[storeId]/(routes)/productos/margen-bajo/page";

describe("página «Margen bajo»", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sin ser la dueña corta antes de leer ofertas o productos", async () => {
    mocks.requireStoreOwner.mockRejectedValue(new Error("No autorizado"));
    await expect(LowMarginPage({ params: { storeId: "store" }, searchParams: {} })).rejects.toThrow("No autorizado");
    expect(mocks.getActiveOffers).not.toHaveBeenCalled();
    expect(mocks.loadLowMargin).not.toHaveBeenCalled();
  });

  it("la dueña carga la vista con las ofertas vigentes", async () => {
    mocks.requireStoreOwner.mockResolvedValue("user");
    mocks.getActiveOffers.mockResolvedValue([]);
    mocks.loadLowMargin.mockResolvedValue({ minimoPct: 40, sinCosto: 0, counts: {}, section: null, rows: [], total: 0, page: 1, pageCount: 1 });
    await LowMarginPage({ params: { storeId: "store" }, searchParams: {} });
    expect(mocks.requireStoreOwner).toHaveBeenCalledWith("store");
    expect(mocks.loadLowMargin).toHaveBeenCalledWith({}, "store", { section: null, page: 1 }, []);
  });
});
