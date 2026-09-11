import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  orderCount: vi.fn(),
  welcome: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  currencyFormatter: (value: number) => `$ ${value}`,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/cors", () => ({ createCorsHeaders: () => ({}) }));
vi.mock("@/lib/customer-benefits", () => ({ assertWelcomeBenefitEligibility: mocks.welcome }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    coupon: { fields: { maxUses: "maxUses-ref" }, findFirst: mocks.findFirst },
    order: { count: mocks.orderCount },
  },
}));

import { POST } from "@/app/api/[storeId]/coupons/validate/route";

const call = (body: unknown) =>
  POST(new Request("https://admin.test/api/store-1/coupons/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { storeId: "store-1" } });

const coupon = {
  id: "c1", storeId: "store-1", code: "VUELVE10", type: "PERCENTAGE", amount: 10, minOrderValue: 20000, maxUses: 3, usedCount: 1,
  isActive: true, isWelcomeBenefit: false, startDate: new Date(), endDate: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

describe("POST /coupons/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.orderCount.mockResolvedValue(0);
    mocks.welcome.mockResolvedValue(undefined);
  });

  it("trims and upper-cases the code and returns only the public fields", async () => {
    mocks.findFirst.mockResolvedValue(coupon);
    const response = await call({ code: "  vuelve10 ", subtotal: 50000 });
    expect(response.status).toBe(200);
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", code: "VUELVE10", isActive: true });
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["amount", "code", "id", "isActive", "isWelcomeBenefit", "minOrderValue", "type"]);
  });

  it("refuses when pending orders already reserved the last uses", async () => {
    mocks.findFirst.mockResolvedValue(coupon);
    mocks.orderCount.mockResolvedValue(2);
    const response = await call({ code: "VUELVE10", subtotal: 50000 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("reservados por pedidos pendientes") });
  });

  it("checks the minimum and rejects an unknown or malformed request", async () => {
    mocks.findFirst.mockResolvedValue(coupon);
    expect((await call({ code: "VUELVE10", subtotal: 1000 })).status).toBe(409);
    mocks.findFirst.mockResolvedValue(null);
    expect((await call({ code: "NADA", subtotal: 50000 })).status).toBe(404);
    expect((await call({ code: "", subtotal: 50000 })).status).toBe(400);
    expect((await call({ code: "X", subtotal: "50000" })).status).toBe(400);
  });
});
