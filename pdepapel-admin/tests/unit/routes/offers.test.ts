import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  offerFindFirst: vi.fn(),
  offerCreate: vi.fn(),
  offerUpdate: vi.fn(),
  offerDelete: vi.fn(),
  offerUpdateMany: vi.fn(),
  productCount: vi.fn(),
  productFindMany: vi.fn(),
  categoryCount: vi.fn(),
  groupCount: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  currencyFormatter: (value: number) => `$ ${value}`,
  CACHE_HEADERS: { NO_CACHE: {}, DYNAMIC: {} },
}));
vi.mock("@/lib/cache", () => ({ invalidateStorePromotionsCache: mocks.invalidate }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    offer: { findFirst: mocks.offerFindFirst, create: mocks.offerCreate, update: mocks.offerUpdate, delete: mocks.offerDelete, updateMany: mocks.offerUpdateMany },
    product: { count: mocks.productCount, findMany: mocks.productFindMany },
    category: { count: mocks.categoryCount },
    productGroup: { count: mocks.groupCount },
  },
}));

import { POST } from "@/app/api/[storeId]/offers/route";
import { DELETE, PATCH } from "@/app/api/[storeId]/offers/[offerId]/route";
import { POST as updateValidity } from "@/app/api/[storeId]/offers/update-validity/route";
import { POST as validate } from "@/app/api/[storeId]/offers/[offerId]/validate/route";

const params = { storeId: "store-1" };
const itemParams = { storeId: "store-1", offerId: "o1" };
const json = (method: string, body?: unknown) =>
  new Request("https://admin.test/api/store-1/offers", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const valid = { name: "Hasta agotar", label: "", type: "FIXED", amount: 9000, startDate: "2026-09-08", endDate: "2026-12-30", productIds: ["p1"], categoryIds: [], productGroupIds: [] };

describe("offer routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.productCount.mockResolvedValue(1);
    mocks.categoryCount.mockResolvedValue(0);
    mocks.groupCount.mockResolvedValue(0);
    mocks.productFindMany.mockResolvedValue([]);
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it("POST stores real UTC instants for the Bogotá days, a null label and refreshes the store", async () => {
    mocks.offerCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "o1", ...data }));
    const response = await POST(json("POST", valid), { params });
    expect(response.status).toBe(200);
    const data = mocks.offerCreate.mock.calls[0][0].data;
    expect(data.label).toBeNull();
    expect(data.startDate.toISOString()).toBe("2026-09-08T05:00:00.000Z");
    expect(data.endDate.toISOString()).toBe("2026-12-31T04:59:59.999Z");
    expect(mocks.invalidate).toHaveBeenCalledWith("store-1");
  });

  it("POST rejects an empty scope, reversed dates, foreign targets and a fixed amount above the price", async () => {
    expect(await (await POST(json("POST", { ...valid, productIds: [] }), { params })).json()).toMatchObject({ error: "Elige al menos un producto, grupo o subcategoría" });
    expect((await POST(json("POST", { ...valid, endDate: "2026-09-01" }), { params })).status).toBe(400);
    mocks.productCount.mockResolvedValueOnce(0);
    expect(await (await POST(json("POST", valid), { params })).json()).toMatchObject({ error: expect.stringContaining("no pertenece a esta tienda") });
    mocks.productFindMany.mockResolvedValueOnce([{ name: "Termo" }]);
    expect(await (await POST(json("POST", valid), { params })).json()).toMatchObject({ error: expect.stringContaining("dejaría en $ 0 a Termo") });
    expect(mocks.offerCreate).not.toHaveBeenCalled();
  });

  it("PATCH and DELETE answer 404 for an offer of another store", async () => {
    mocks.offerFindFirst.mockResolvedValue(null);
    expect((await PATCH(json("PATCH", valid), { params: itemParams })).status).toBe(404);
    expect((await DELETE(json("DELETE"), { params: itemParams })).status).toBe(404);
    expect(mocks.offerUpdate).not.toHaveBeenCalled();
    expect(mocks.offerDelete).not.toHaveBeenCalled();
  });

  it("PATCH replaces the targets atomically and keeps the store in the where", async () => {
    mocks.offerFindFirst.mockResolvedValue({ id: "o1" });
    mocks.offerUpdate.mockResolvedValue({ id: "o1" });
    const response = await PATCH(json("PATCH", valid), { params: itemParams });
    expect(response.status).toBe(200);
    const call = mocks.offerUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "o1", storeId: "store-1" });
    expect(call.data.products).toEqual({ deleteMany: {}, create: [{ product: { connect: { id: "p1" } } }] });
  });

  it("update-validity only switches expired offers off", async () => {
    mocks.offerUpdateMany.mockResolvedValue({ count: 1 });
    const response = await updateValidity(json("POST"), { params });
    expect(await response.json()).toMatchObject({ deactivated: 1 });
    const where = mocks.offerUpdateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ storeId: "store-1", isActive: true });
    expect(where.endDate.lt).toBeInstanceOf(Date);
    expect(mocks.offerUpdateMany.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(mocks.offerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("validate never re-enables a manually deactivated offer", async () => {
    const future = new Date(Date.now() + 86_400_000);
    mocks.offerFindFirst.mockResolvedValue({ id: "o1", isActive: false, startDate: new Date(0), endDate: future });
    const response = await validate(json("POST"), { params: itemParams });
    expect(await response.json()).toMatchObject({ status: "desactivada" });
    expect(mocks.offerUpdate).not.toHaveBeenCalled();
  });
});
