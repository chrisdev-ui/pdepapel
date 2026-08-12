import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findConnection: vi.fn(),
  getCashflowSummary: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    Unauthenticated: () => new Error("Unauthenticated"),
    MissingStoreId: () => new Error("Missing store ID"),
    NotFound: (message: string) => new Error(message),
  },
  handleErrorResponse: () => new Response(null, { status: 500 }),
}));
vi.mock("@/lib/mercadolibre/cashflow", () => ({
  getMercadoLibreCashflowSummary: mocks.getCashflowSummary,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findUnique: mocks.findConnection },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));

import { GET } from "@/app/api/[storeId]/marketplaces/mercadolibre/cashflow/route";

describe("Mercado Libre cashflow route", () => {
  it("returns a read-only summary for the connected seller", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findConnection.mockResolvedValue({
      id: "connection-id",
      sellerId: "seller-id",
    });
    mocks.getCashflowSummary.mockResolvedValue({
      accountBalance: { state: "UNAVAILABLE", reason: "UNSUPPORTED" },
      awaitingRelease: { amount: 0, orders: 0 },
      settlementPending: { orders: 0 },
      releaseStatusUnknown: { orders: 0 },
      upcomingReleases: [],
      updatedAt: new Date("2026-08-11T12:00:00.000Z"),
    });

    const response = await GET(new Request("https://admin.example.com"), {
      params: { storeId: "store-id" },
    });

    expect(response.status).toBe(200);
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", "store-id");
    expect(mocks.getCashflowSummary).toHaveBeenCalledWith({
      connectionId: "connection-id",
      sellerId: "seller-id",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
