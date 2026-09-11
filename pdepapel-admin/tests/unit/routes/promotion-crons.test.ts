import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  couponUpdateMany: vi.fn(),
  offerUpdateMany: vi.fn(),
  offerFindMany: vi.fn(),
  recordJobRun: vi.fn(),
  refreshSoldCounts: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { CRON_SECRET: "secret" } }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.recordJobRun }));
vi.mock("@/lib/sold-count", () => ({ refreshSoldCounts: mocks.refreshSoldCounts }));
vi.mock("@/lib/cache", () => ({ invalidateStorePromotionsCache: mocks.invalidate }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    coupon: { fields: { maxUses: "maxUses-ref" }, updateMany: mocks.couponUpdateMany },
    offer: { updateMany: mocks.offerUpdateMany, findMany: mocks.offerFindMany },
  },
}));

import { GET as coupons } from "@/app/api/cron/update-coupons/route";
import { GET as offers } from "@/app/api/cron/update-offers/route";
import { NextRequest } from "next/server";

const request = (token = "secret") => new NextRequest("https://admin.test/api/cron/x", { headers: { authorization: `Bearer ${token}` } });

describe("promotion crons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.couponUpdateMany.mockResolvedValue({ count: 2 });
    mocks.offerUpdateMany.mockResolvedValue({ count: 1 });
    mocks.offerFindMany.mockResolvedValue([{ storeId: "s1" }]);
    mocks.refreshSoldCounts.mockResolvedValue(10);
    mocks.recordJobRun.mockResolvedValue(undefined);
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it("coupons: switches off expired or exhausted ones and never switches any on", async () => {
    const response = await coupons(request());
    expect(await response.json()).toEqual({ deactivated: 2 });
    expect(mocks.couponUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.couponUpdateMany.mock.calls[0][0];
    expect(call.data).toEqual({ isActive: false });
    expect(call.where.isActive).toBe(true);
    expect(call.where.OR[0].endDate.lt).toBeInstanceOf(Date);
    expect((await coupons(request("nope"))).status).toBe(403);
  });

  it("offers: switches off expired ones, never on, and refreshes the stores whose windows moved", async () => {
    const response = await offers(request());
    expect(await response.json()).toEqual({ deactivated: 1, refreshedStores: 1, refreshedSoldCounts: 10 });
    expect(mocks.offerUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.offerUpdateMany.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(mocks.invalidate).toHaveBeenCalledWith("s1");
  });
});
