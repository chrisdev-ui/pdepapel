import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, resilientBatch, recordIssues, queueSync, dispatch } = vi.hoisted(() => {
  const prisma = {
    marketplaceConnection: { findUnique: vi.fn() },
    marketplaceOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
    product: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    resilientBatch: vi.fn(),
    recordIssues: vi.fn(),
    queueSync: vi.fn(),
    dispatch: vi.fn(),
  };
});

vi.mock("@/lib/prismadb", () => ({ default: prisma }));
vi.mock("@/lib/inventory", () => ({
  createInventoryMovementBatchResilient: (...args: unknown[]) => resilientBatch(...args),
  // Sin kits en este test: cada línea es su propio producto físico.
  explodeSaleLines: async (_tx: unknown, lines: { productId: string; quantity: number }[]) =>
    lines.map((line) => ({
      ...line,
      physicalProductId: line.productId,
      physicalQuantity: line.quantity,
      kitId: null,
      kitName: null,
    })),
}));
vi.mock("@/lib/order-inventory-issues", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fair-issue-reference")>(
    "@/lib/fair-issue-reference",
  );
  return {
    formatMarketplaceIssueReference: actual.formatMarketplaceIssueReference,
    recordInventoryIssues: (...args: unknown[]) => recordIssues(...args),
  };
});
vi.mock("@/lib/mercadolibre/outbox", () => ({
  queueMarketplaceStockSyncEvents: (...args: unknown[]) => queueSync(...args),
  enqueuePendingMarketplaceOutboxEvents: (...args: unknown[]) => dispatch(...args),
}));

import { confirmMercadoLibreOrderReturn } from "@/lib/mercadolibre/order-restock";

const input = { storeId: "store-1", externalOrderId: "2000017813937484", userId: "user-1" };

describe("confirmMercadoLibreOrderReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    prisma.marketplaceConnection.findUnique.mockResolvedValue({ id: "conn-1" });
    prisma.marketplaceOrder.updateMany.mockResolvedValue({ count: 1 });
    resilientBatch.mockResolvedValue({ success: [], failed: [] });
    recordIssues.mockResolvedValue(0);
    dispatch.mockResolvedValue(0);
  });

  it("refuses unless the sale is cancelled with its inventory still out", async () => {
    prisma.marketplaceOrder.findUnique.mockResolvedValueOnce({
      id: "mo-1", status: "PAID", inventoryStatus: "DECREMENTED", items: [],
    });
    await expect(confirmMercadoLibreOrderReturn(input)).rejects.toMatchObject({ statusCode: 409 });
    expect(resilientBatch).not.toHaveBeenCalled();
  });

  it("is a no-op when the return was already confirmed", async () => {
    prisma.marketplaceOrder.findUnique.mockResolvedValueOnce({
      id: "mo-1", status: "CANCELLED", inventoryStatus: "RESTOCKED", items: [],
    });
    await expect(confirmMercadoLibreOrderReturn(input)).resolves.toMatchObject({
      alreadyRestocked: true, returned: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns every unit through the ledger helper, records failed lines as marketplace debt and re-syncs stock", async () => {
    prisma.marketplaceOrder.findUnique.mockResolvedValueOnce({
      id: "mo-1",
      status: "CANCELLED",
      inventoryStatus: "RESTOCK_PENDING",
      items: [
        { productId: "p1", quantity: 2, title: "Cuaderno" },
        { productId: "p2", quantity: 1, title: "Stickers" },
      ],
    });
    resilientBatch.mockResolvedValueOnce({
      success: [{ productId: "p1", quantity: 2, productName: "Cuaderno" }],
      failed: [{ productId: "p2", quantity: 1, productName: "Stickers", reason: "Producto no encontrado" }],
    });
    recordIssues.mockResolvedValueOnce(1);

    const result = await confirmMercadoLibreOrderReturn(input);

    expect(prisma.marketplaceOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "mo-1", inventoryStatus: "RESTOCK_PENDING" },
      data: expect.objectContaining({ inventoryStatus: "RESTOCKED", inventoryError: null }),
    });
    expect(resilientBatch).toHaveBeenCalledWith(prisma, [
      expect.objectContaining({ productId: "p1", type: "ORDER_CANCELLED", quantity: 2, referenceId: "mo-1" }),
      expect.objectContaining({ productId: "p2", type: "ORDER_CANCELLED", quantity: 1 }),
    ]);
    expect(recordIssues).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        orderId: null,
        orderNumber: "Mercado Libre: 2000017813937484",
        kind: "RESTOCK",
        failed: [expect.objectContaining({ productId: "p2" })],
      }),
    );
    expect(queueSync).toHaveBeenCalledWith(prisma, ["p1", "p2"]);
    expect(dispatch).toHaveBeenCalledWith("conn-1");
    expect(result).toEqual({ marketplaceOrderId: "mo-1", returned: 2, issues: 1, alreadyRestocked: false });
  });

  it("does not release the claim to a second caller", async () => {
    prisma.marketplaceOrder.findUnique.mockResolvedValueOnce({
      id: "mo-1", status: "CANCELLED", inventoryStatus: "RESTOCK_PENDING",
      items: [{ productId: "p1", quantity: 1, title: "Cuaderno" }],
    });
    prisma.marketplaceOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(confirmMercadoLibreOrderReturn(input)).rejects.toMatchObject({ statusCode: 409 });
    expect(resilientBatch).not.toHaveBeenCalled();
  });
});
