import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOverview: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    Unauthenticated: () => new Error("Unauthenticated"),
    MissingStoreId: () => new Error("Missing store ID"),
  },
  handleErrorResponse: () => new Response(null, { status: 500 }),
}));
vi.mock("@/lib/business-growth-data", () => ({
  getBusinessGrowthOverview: mocks.getOverview,
}));
vi.mock("@/lib/date-utils", () => ({
  getColombiaDate: () => new Date(2026, 8, 1, 12),
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));

import { GET } from "@/app/api/[storeId]/business-growth/overview/route";

describe("business growth overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.getOverview.mockResolvedValue({
      period: { year: 2025, month: 8 },
    });
  });

  it("forwards the selected month after verifying the store owner", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/business-growth/overview?year=2025&month=8",
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", "store-id");
    const referenceDate = mocks.getOverview.mock.calls[0][1] as Date;
    expect(referenceDate.getFullYear()).toBe(2025);
    expect(referenceDate.getMonth()).toBe(7);
    expect(referenceDate.getDate()).toBe(15);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
