import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  inspect: vi.fn(),
  reconcile: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceConnection: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/mercadolibre/historical-sales", () => ({
  inspectMercadoLibreHistoricalSale: mocks.inspect,
  reconcileMercadoLibreHistoricalSale: mocks.reconcile,
}));

import { POST as inspect } from "@/app/api/[storeId]/marketplaces/mercadolibre/historical-sales/inspect/route";
import { POST as reconcile } from "@/app/api/[storeId]/marketplaces/mercadolibre/historical-sales/reconcile/route";

describe("Mercado Libre historical sales routes", () => {
  it("inspects a historical sale without applying inventory", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findUnique.mockResolvedValue({
      id: "connection-id",
      status: "CONNECTED",
    });
    mocks.inspect.mockResolvedValue({
      referenceType: "pack",
      pack: null,
      orders: [],
    });

    const response = await inspect(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({ reference: "2000014415856007" }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(
      "connection-id",
      "store-id",
      "2000014415856007",
    );
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner before reconciling inventory", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await reconcile(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({ externalOrderId: "2000017813937484" }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
