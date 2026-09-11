import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findListings: vi.fn(),
  findOrder: vi.fn(),
  updateOrder: vi.fn(),
  upsertOrder: vi.fn(),
  findProducts: vi.fn(),
  txClaim: vi.fn(),
  txProducts: vi.fn(),
  txProductUpdate: vi.fn(),
  txMovement: vi.fn(),
  txKits: vi.fn(),
  queueNotification: vi.fn(),
  queueFinancials: vi.fn(),
  queueStock: vi.fn(),
  enqueue: vi.fn(),
}));

const tx = {
  marketplaceOrder: { updateMany: mocks.txClaim },
  product: { findMany: mocks.txProducts, updateMany: mocks.txProductUpdate },
  inventoryMovement: { create: mocks.txMovement },
  productKit: { findMany: mocks.txKits },
};

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: { findMany: mocks.findListings },
    marketplaceOrder: {
      findUnique: mocks.findOrder,
      update: mocks.updateOrder,
      upsert: mocks.upsertOrder,
    },
    product: { findMany: mocks.findProducts },
    $transaction: async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));
vi.mock("@/lib/inventory", () => ({
  recalculateKitStock: vi.fn(),
  explodeSaleLines: async (_t: unknown, lines: { productId: string; quantity: number; unitPrice: number }[]) =>
    lines.map((line) => ({ ...line, physicalProductId: line.productId, physicalQuantity: line.quantity, kitId: null, kitName: null })),
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueue,
  queueMarketplaceOrderFinancials: mocks.queueFinancials,
  queueMarketplaceOrderNotification: mocks.queueNotification,
  queueMarketplaceStockSyncEvents: mocks.queueStock,
}));

import { synchronizeMercadoLibreOrder } from "@/lib/mercadolibre/order-sync";

const payload = {
  id: "2000017813937484",
  status: "paid",
  total_amount: 20_000,
  date_closed: "2026-09-01T12:00:00.000Z",
  order_items: [{ quantity: 2, unit_price: 10_000, item: { id: "MCO1", title: "Cuaderno" } }],
};

describe("synchronizeMercadoLibreOrder inventory path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findListings.mockResolvedValue([
      { id: "listing-1", productId: "p1", externalItemId: "MCO1", externalVariationId: null, stockSafetyBuffer: 0, syncStock: true },
    ]);
    mocks.findProducts.mockResolvedValue([{ id: "p1", acqPrice: 4000 }]);
    mocks.txClaim.mockResolvedValue({ count: 1 });
    mocks.txProducts.mockResolvedValue([{ id: "p1", name: "Cuaderno", stock: 5, acqPrice: 4000 }]);
    mocks.txProductUpdate.mockResolvedValue({ count: 1 });
    mocks.txKits.mockResolvedValue([]);
    mocks.enqueue.mockResolvedValue(0);
  });

  it("queues the sale notification inside the inventory transaction, keyed on the order", async () => {
    // findUnique: primero la lectura de ítems previos, luego la de estado.
    mocks.findOrder.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.upsertOrder.mockResolvedValue({ id: "mo-1", inventoryStatus: "NOT_APPLIED", netAmount: null });

    const result = await synchronizeMercadoLibreOrder("conn-1", "store-1", payload);

    expect(result).toEqual({ inventoryChanged: true, needsAttention: false });
    expect(mocks.queueNotification).toHaveBeenCalledWith(tx, {
      connectionId: "conn-1",
      externalOrderId: "2000017813937484",
      marketplaceOrderId: "mo-1",
    });
    expect(mocks.txMovement).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: "p1", quantity: -2 }) }),
    );
  });

  it("does not rebuild the items of a sale whose inventory is already applied", async () => {
    mocks.findOrder
      .mockResolvedValueOnce({ items: [{ externalItemId: "MCO1", externalVariationId: null, acqPrice: 4000 }] })
      .mockResolvedValueOnce({ status: "PAID", inventoryStatus: "DECREMENTED", refundedAmount: null, metadata: null });
    mocks.upsertOrder.mockResolvedValue({ id: "mo-1", inventoryStatus: "DECREMENTED", netAmount: 15_000 });
    mocks.txClaim.mockResolvedValue({ count: 0 });

    await synchronizeMercadoLibreOrder("conn-1", "store-1", payload);

    const upsert = mocks.upsertOrder.mock.calls[0][0];
    expect(upsert.update.items).toBeUndefined();
    expect(upsert.create.items).toBeDefined();
    expect(mocks.txMovement).not.toHaveBeenCalled();
  });

  it("still rebuilds the items while the inventory has not been applied", async () => {
    mocks.findOrder
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ status: "PENDING", inventoryStatus: "NOT_APPLIED", refundedAmount: null, metadata: null });
    mocks.upsertOrder.mockResolvedValue({ id: "mo-1", inventoryStatus: "NOT_APPLIED", netAmount: null });

    await synchronizeMercadoLibreOrder("conn-1", "store-1", payload);

    const upsert = mocks.upsertOrder.mock.calls[0][0];
    expect(upsert.update.items).toMatchObject({ deleteMany: {} });
  });
});
