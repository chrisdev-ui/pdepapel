import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  couponFindFirst: vi.fn(),
  couponFindMany: vi.fn(),
  couponCount: vi.fn(),
  couponCreate: vi.fn(),
  couponUpdate: vi.fn(),
  couponUpdateMany: vi.fn(),
  couponDelete: vi.fn(),
  couponDeleteMany: vi.fn(),
  orderCount: vi.fn(),
  orderFindMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  currencyFormatter: (value: number) => `$ ${value}`,
  CACHE_HEADERS: { NO_CACHE: {}, DYNAMIC: {} },
}));
vi.mock("@/lib/prismadb", () => {
  const coupon = {
    fields: { maxUses: "maxUses-ref" },
    findFirst: mocks.couponFindFirst,
    findMany: mocks.couponFindMany,
    count: mocks.couponCount,
    create: mocks.couponCreate,
    update: mocks.couponUpdate,
    updateMany: mocks.couponUpdateMany,
    delete: mocks.couponDelete,
    deleteMany: mocks.couponDeleteMany,
  };
  const order = { count: mocks.orderCount, findMany: mocks.orderFindMany };
  const db = { coupon, order, $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({ coupon, order })) };
  return { default: db };
});

import { DELETE as bulkDelete, PATCH as bulkPatch, POST } from "@/app/api/[storeId]/coupons/route";
import { DELETE, GET, PATCH, PUT } from "@/app/api/[storeId]/coupons/[couponId]/route";
import { NextRequest } from "next/server";

const params = { storeId: "store-1" };
const itemParams = { storeId: "store-1", couponId: "c1" };
const json = (method: string, body?: unknown) =>
  new NextRequest("https://admin.test/api/store-1/coupons", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const valid = { code: "verano25", type: "PERCENTAGE", amount: 10, startDate: "2026-09-01", endDate: "2026-09-30", maxUses: 50, minOrderValue: 20000, isActive: true, isWelcomeBenefit: false };

describe("coupon routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.orderCount.mockResolvedValue(0);
    mocks.orderFindMany.mockResolvedValue([]);
  });

  it("POST answers 401 before reading the body", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await POST(json("POST", valid), { params });
    expect(response.status).toBe(401);
  });

  it("POST validates the input and stores the whole Bogotá day window", async () => {
    mocks.couponFindFirst.mockResolvedValue(null);
    mocks.couponCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
    const response = await POST(json("POST", valid), { params });
    expect(response.status).toBe(200);
    const data = mocks.couponCreate.mock.calls[0][0].data;
    expect(data.code).toBe("VERANO25");
    expect(data.startDate.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(data.endDate.toISOString()).toBe("2026-10-01T04:59:59.999Z");
    expect(data.maxUses).toBe(50);
  });

  it("POST rejects bad input with a Spanish message and duplicates with 409", async () => {
    const bad = await POST(json("POST", { ...valid, amount: 150 }), { params });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "El porcentaje no puede ser mayor a 100" });

    mocks.couponFindFirst.mockResolvedValue({ id: "other" });
    const duplicate = await POST(json("POST", valid), { params });
    expect(duplicate.status).toBe(409);
  });

  it("GET returns the detail with usage and recent orders, scoped to the store", async () => {
    mocks.couponFindFirst.mockResolvedValue({ id: "c1", storeId: "store-1", maxUses: 50, usedCount: 1 });
    mocks.orderCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    mocks.orderFindMany.mockResolvedValue([{ id: "o1", orderNumber: "4871" }]);
    const response = await GET(json("GET"), { params: itemParams });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ usage: { used: 1, reserved: 2, limit: 50, remaining: 47 }, ordersCount: 3, recentOrders: [{ orderNumber: "4871" }] });
    expect(mocks.couponFindFirst).toHaveBeenCalledWith({ where: { id: "c1", storeId: "store-1" } });
  });

  it("PATCH answers 404 for a coupon of another store and never touches it", async () => {
    mocks.couponFindFirst.mockResolvedValue(null);
    const response = await PATCH(json("PATCH", valid), { params: itemParams });
    expect(response.status).toBe(404);
    expect(mocks.couponUpdate).not.toHaveBeenCalled();
  });

  it("PATCH refuses a limit below the registered uses and updates with the store in the where", async () => {
    mocks.couponFindFirst.mockResolvedValueOnce({ id: "c1", usedCount: 7 });
    const low = await PATCH(json("PATCH", { ...valid, maxUses: 5 }), { params: itemParams });
    expect(low.status).toBe(400);
    expect(await low.json()).toMatchObject({ error: expect.stringContaining("7 usos ya registrados") });

    mocks.couponFindFirst.mockResolvedValueOnce({ id: "c1", usedCount: 7 }).mockResolvedValueOnce(null);
    mocks.couponUpdate.mockResolvedValue({ id: "c1" });
    const ok = await PATCH(json("PATCH", valid), { params: itemParams });
    expect(ok.status).toBe(200);
    expect(mocks.couponUpdate.mock.calls[0][0].where).toEqual({ id: "c1", storeId: "store-1" });
  });

  it("DELETE refuses a coupon with orders and otherwise deletes within the store", async () => {
    mocks.couponFindFirst.mockResolvedValueOnce({ id: "c1", code: "X", _count: { orders: 3 } });
    const refused = await DELETE(json("DELETE"), { params: itemParams });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining("3 pedidos lo referencian") });
    expect(mocks.couponDelete).not.toHaveBeenCalled();

    mocks.couponFindFirst.mockResolvedValueOnce({ id: "c1", code: "X", _count: { orders: 0 } });
    mocks.couponDelete.mockResolvedValue({});
    const ok = await DELETE(json("DELETE"), { params: itemParams });
    expect(ok.status).toBe(200);
    expect(mocks.couponDelete).toHaveBeenCalledWith({ where: { id: "c1", storeId: "store-1" } });
  });

  it("PUT deactivates without touching the window", async () => {
    mocks.couponFindFirst.mockResolvedValue({ id: "c1", isActive: true });
    mocks.couponUpdate.mockResolvedValue({ id: "c1", isActive: false });
    const response = await PUT(json("PUT"), { params: itemParams });
    expect(response.status).toBe(200);
    expect(mocks.couponUpdate.mock.calls[0][0]).toEqual({ where: { id: "c1", storeId: "store-1" }, data: { isActive: false }, select: expect.any(Object) });

    mocks.couponFindFirst.mockResolvedValue({ id: "c1", isActive: false });
    expect((await PUT(json("PUT"), { params: itemParams })).status).toBe(409);
  });

  it("bulk DELETE uses the same order guard as the single delete", async () => {
    mocks.couponFindMany.mockResolvedValue([
      { id: "a", code: "A", _count: { orders: 0 } },
      { id: "b", code: "B", _count: { orders: 1 } },
    ]);
    const response = await bulkDelete(json("DELETE", { ids: ["a", "b"] }), { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("El cupón B tiene pedidos asociados") });
    expect(mocks.couponDeleteMany).not.toHaveBeenCalled();
  });

  it("bulk PATCH only switches coupons off and keeps their dates", async () => {
    mocks.couponCount.mockResolvedValue(2);
    mocks.couponUpdateMany.mockResolvedValue({ count: 2 });
    const response = await bulkPatch(json("PATCH", { ids: ["a", "b"] }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deactivated: 2 });
    expect(mocks.couponUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["a", "b"] }, storeId: "store-1", isActive: true },
      data: { isActive: false },
    });
  });
});
