import { OrderStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findOrder: vi.fn(),
  requoteCartShipping: vi.fn(),
  createGuideForOrder: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: vi.fn(),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findFirst: mocks.findOrder },
    shipping: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _msg: string, fn: () => Promise<unknown>) =>
    fn(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));
vi.mock("@/lib/shipping-helpers", () => ({
  requoteCartShipping: mocks.requoteCartShipping,
  createGuideForOrder: mocks.createGuideForOrder,
}));

import { POST } from "@/app/api/[storeId]/orders/[orderId]/shipping/requote-and-guide/route";
import { canCreateGuide, describeGuideBlock } from "@/lib/order-transitions";

const order = (status: OrderStatus, isCOD = false) => ({
  id: "order-1",
  storeId: "store-1",
  status,
  total: 45000,
  daneCode: "05001",
  address: "Calle 10 #43-21",
  shipping: {
    id: "ship-1",
    isCOD,
    envioClickIdOrder: null,
    envioClickIdRate: 10,
    cost: 9800,
    carrierName: "Servientrega",
    productName: "Estándar",
  },
  orderItems: [{ productId: "p1", quantity: 1 }],
});

const call = () =>
  POST(
    new Request(
      "https://admin.test/api/store-1/orders/order-1/shipping/requote-and-guide",
      { method: "POST", body: "{}" },
    ),
    {
      params: { storeId: "store-1", orderId: "order-1" },
    },
  );

describe("canCreateGuide", () => {
  it.each([
    [OrderStatus.PAID, false, true],
    [OrderStatus.PAID, true, true],
    [OrderStatus.PENDING, true, true],
    [OrderStatus.PENDING, false, false],
    [OrderStatus.DRAFT, true, false],
    [OrderStatus.SENT, false, false],
    [OrderStatus.CANCELLED, true, false],
  ])("%s · COD %s → %s", (status, isCOD, expected) => {
    expect(canCreateGuide(status, isCOD)).toBe(expected);
    expect(describeGuideBlock(status, isCOD) === null).toBe(expected);
  });
});

describe("POST /shipping/requote-and-guide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.requoteCartShipping.mockResolvedValue([]);
  });

  it("refuses to quote or create a guide for an unpaid order", async () => {
    mocks.findOrder.mockResolvedValue(order(OrderStatus.PENDING));

    const response = await call();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "La orden debe estar en estado PAGADA para crear la guía",
    });
    expect(mocks.requoteCartShipping).not.toHaveBeenCalled();
    expect(mocks.createGuideForOrder).not.toHaveBeenCalled();
  });

  it("refuses a draft even when it is cash on delivery", async () => {
    mocks.findOrder.mockResolvedValue(order(OrderStatus.DRAFT, true));

    const response = await call();

    expect(response.status).toBe(400);
    expect(mocks.requoteCartShipping).not.toHaveBeenCalled();
  });

  it("lets a paid order through to the carrier quote", async () => {
    mocks.findOrder.mockResolvedValue(order(OrderStatus.PAID));

    const response = await call();

    expect(mocks.requoteCartShipping).toHaveBeenCalledTimes(1);
    // Sin tarifas la ruta contesta 400, pero ya pasó la puerta del estado.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Ninguna transportadora"),
    });
  });

  it("lets a pending cash-on-delivery order through", async () => {
    mocks.findOrder.mockResolvedValue(order(OrderStatus.PENDING, true));

    await call();

    expect(mocks.requoteCartShipping).toHaveBeenCalledTimes(1);
  });
});
