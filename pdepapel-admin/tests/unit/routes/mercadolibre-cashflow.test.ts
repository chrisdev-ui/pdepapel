import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findConnection: vi.fn(),
  getCashflowSummary: vi.fn(),
  refreshReleaseStatuses: vi.fn(),
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
  refreshMercadoLibreCashflowReleaseStatuses: mocks.refreshReleaseStatuses,
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

import {
  GET,
  POST,
} from "@/app/api/[storeId]/marketplaces/mercadolibre/cashflow/route";

describe("Mercado Libre cashflow route", () => {
  it("returns a read-only summary for the connected account", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findConnection.mockResolvedValue({
      id: "connection-id",
    });
    mocks.getCashflowSummary.mockResolvedValue({
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
    expect(mocks.getCashflowSummary).toHaveBeenCalledWith("connection-id");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refreshes only release dates before returning the summary", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findConnection.mockResolvedValue({ id: "connection-id" });
    mocks.refreshReleaseStatuses.mockResolvedValue({
      checkedOrders: 1,
      refreshedOrders: 1,
      pendingOrders: 0,
      failedOrders: 0,
    });
    mocks.getCashflowSummary.mockResolvedValue({
      awaitingRelease: { amount: 46_457, orders: 1 },
      settlementPending: { orders: 0 },
      releaseStatusUnknown: { orders: 0 },
      upcomingReleases: [],
      updatedAt: new Date("2026-08-11T12:00:00.000Z"),
    });

    const response = await POST(new Request("https://admin.example.com"), {
      params: { storeId: "store-id" },
    });

    expect(response.status).toBe(200);
    expect(mocks.refreshReleaseStatuses).toHaveBeenCalledWith("connection-id");
    expect(mocks.getCashflowSummary).toHaveBeenCalledWith("connection-id");
    expect(await response.json()).toMatchObject({
      refresh: { refreshedOrders: 1 },
    });
  });
});
