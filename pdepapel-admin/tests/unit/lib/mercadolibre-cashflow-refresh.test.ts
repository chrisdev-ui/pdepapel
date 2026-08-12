import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrders: vi.fn(),
  updateOrder: vi.fn(),
  getFinancials: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOrder: {
      findMany: mocks.findOrders,
      update: mocks.updateOrder,
    },
  },
}));
vi.mock("@/lib/mercadolibre/order-financials", () => ({
  MercadoLibreFinancialsPendingError: class MercadoLibreFinancialsPendingError extends Error {},
  getMercadoLibreOrderFinancials: mocks.getFinancials,
}));

import { refreshMercadoLibreCashflowReleaseStatuses } from "@/lib/mercadolibre/cashflow";

describe("Mercado Libre cashflow release refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a release date to a historical sale without overwriting its settled financial data", async () => {
    const checkedAt = new Date("2026-08-11T12:00:00.000Z");
    mocks.findOrders.mockResolvedValue([
      {
        id: "marketplace-order-id",
        externalOrderId: "2000017813937484",
        paidAt: new Date("2026-08-07T20:41:18.000Z"),
        totalAmount: 69_000,
        netAmount: 46_457,
        metadata: {
          source: "HISTORICAL_RECONCILIATION",
          taxesAmount: 933,
          reconciledFromPackId: "2000014415856007",
        },
      },
    ]);
    mocks.getFinancials.mockResolvedValue({
      marketplaceFee: 13_110,
      shippingCost: 8_500,
      taxesAmount: 933,
      netAmount: 46_457,
      moneyReleaseDate: "2026-08-14T12:00:00.000Z",
      moneyReleaseStatus: "pending",
    });

    await expect(
      refreshMercadoLibreCashflowReleaseStatuses("connection-id", checkedAt),
    ).resolves.toEqual({
      checkedOrders: 1,
      refreshedOrders: 1,
      pendingOrders: 0,
      failedOrders: 0,
    });

    expect(mocks.getFinancials).toHaveBeenCalledWith(
      "connection-id",
      "2000017813937484",
      69_000,
    );
    expect(mocks.updateOrder).toHaveBeenCalledWith({
      where: { id: "marketplace-order-id" },
      data: {
        metadata: expect.objectContaining({
          source: "HISTORICAL_RECONCILIATION",
          taxesAmount: 933,
          reconciledFromPackId: "2000014415856007",
          financials: expect.objectContaining({
            moneyReleaseDate: "2026-08-14T12:00:00.000Z",
            moneyReleaseStatus: "pending",
          }),
        }),
      },
    });
  });
});
