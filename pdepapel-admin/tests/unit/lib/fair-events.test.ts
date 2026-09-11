import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, resilientBatch, recordIssues, queueSync } = vi.hoisted(() => {
  const prisma = {
    fairEvent: { findFirst: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    fairCapsule: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    fairEventInventoryItem: { updateMany: vi.fn(), update: vi.fn() },
    productKit: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn(prisma),
  );
  return {
    prisma,
    resilientBatch: vi.fn(),
    recordIssues: vi.fn(),
    queueSync: vi.fn(),
  };
});

vi.mock("@/lib/prismadb", () => ({ default: prisma }));
vi.mock("@/lib/inventory", () => ({
  recalculateKitStock: vi.fn(),
  createInventoryMovementBatchResilient: (...args: unknown[]) =>
    resilientBatch(...args),
}));
vi.mock("@/lib/order-inventory-issues", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/order-inventory-issues")
  >("@/lib/order-inventory-issues");
  return {
    formatFairIssueReference: actual.formatFairIssueReference,
    recordInventoryIssues: (...args: unknown[]) => recordIssues(...args),
  };
});
vi.mock("@/lib/mercadolibre/outbox", () => ({
  queueMarketplaceStockSyncEvents: (...args: unknown[]) => queueSync(...args),
}));
vi.mock("@/lib/utils", () => ({ generateOrderNumber: vi.fn() }));

import {
  cancelFairSale,
  getCapsuleMargin,
  getFairStockAvailability,
  reconcileFairEvent,
  reopenFairEvent,
  startFairReconciliation,
} from "@/lib/fair-events";

describe("fair event inventory helpers", () => {
  it("keeps direct stock, packed capsules, returns, damage, and losses separated", () => {
    expect(
      getFairStockAvailability({
        allocatedQuantity: 20,
        soldQuantity: 6,
        packedQuantity: 4,
        returnedQuantity: 3,
        damagedQuantity: 1,
        lostQuantity: 2,
      }),
    ).toBe(4);
  });

  it("calculates the capsule gross margin from the physical product cost", () => {
    expect(getCapsuleMargin(10000, 6000)).toBe(40);
    expect(getCapsuleMargin(8000, 8000)).toBe(0);
    expect(getCapsuleMargin(5000, 6000)).toBe(-20);
  });

  it("does not accept a zero or negative capsule sale price", () => {
    expect(getCapsuleMargin(0, 2000)).toBe(-Infinity);
    expect(getCapsuleMargin(-1, 2000)).toBe(-Infinity);
  });
});

describe("fair reconciliation phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    prisma.fairEvent.update.mockImplementation(async ({ data }) => ({
      id: "fair-1",
      ...data,
    }));
    prisma.productKit.findMany.mockResolvedValue([]);
    prisma.fairCapsule.updateMany.mockResolvedValue({ count: 0 });
    resilientBatch.mockResolvedValue({ success: [], failed: [] });
    recordIssues.mockResolvedValue(0);
  });

  it("moves an open fair to RECONCILING and back to OPEN", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "OPEN" });
    await expect(
      startFairReconciliation({ storeId: "s", fairEventId: "fair-1" }),
    ).resolves.toMatchObject({ status: "RECONCILING" });

    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "RECONCILING" });
    await expect(
      reopenFairEvent({ storeId: "s", fairEventId: "fair-1" }),
    ).resolves.toMatchObject({ status: "OPEN" });
  });

  it("refuses to start reconciliation unless the fair is open, and to reopen unless reconciling", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "DRAFT" });
    await expect(
      startFairReconciliation({ storeId: "s", fairEventId: "fair-1" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "CLOSED" });
    await expect(
      reopenFairEvent({ storeId: "s", fairEventId: "fair-1" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("closes only from RECONCILING and tells an open fair to stop sales first", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({
      id: "fair-1",
      name: "Feria",
      status: "OPEN",
      inventoryItems: [],
    });
    await expect(
      reconcileFairEvent({ storeId: "s", fairEventId: "fair-1", items: [], userId: "u" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("conciliación"),
    });
  });

  it("closes the fair even when a return cannot land, and records the debt without an order", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({
      id: "fair-1",
      name: "Feria del Libro",
      status: "RECONCILING",
      inventoryItems: [
        {
          id: "item-1",
          productId: "p1",
          allocatedQuantity: 5,
          soldQuantity: 2,
          product: { id: "p1", name: "Cuaderno", stock: 10, acqPrice: 4000, price: 9000 },
        },
      ],
    });
    resilientBatch.mockResolvedValueOnce({
      success: [],
      failed: [
        { productId: "p1", quantity: 3, productName: "Cuaderno", reason: "Producto no encontrado" },
      ],
    });
    recordIssues.mockResolvedValueOnce(1);

    const result = await reconcileFairEvent({
      storeId: "s",
      fairEventId: "fair-1",
      items: [{ productId: "p1", returnedQuantity: 3, damagedQuantity: 0, lostQuantity: 0 }],
      userId: "u",
    });

    expect(resilientBatch).toHaveBeenCalledWith(
      prisma,
      [
        expect.objectContaining({
          productId: "p1",
          type: "FESTIVAL_RETURN",
          quantity: 3,
          referenceId: "fair-1",
        }),
      ],
    );
    expect(recordIssues).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        storeId: "s",
        orderId: null,
        orderNumber: "Feria: Feria del Libro",
        kind: "RESTOCK",
        failed: [expect.objectContaining({ productId: "p1", quantity: 3 })],
      }),
    );
    expect(prisma.fairEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED" }) }),
    );
    expect(result).toMatchObject({ status: "CLOSED", inventoryIssues: 1 });
    // Los daños y pérdidas quedan solo en la feria: nunca pasan por el kardex.
    expect(resilientBatch.mock.calls[0][1]).toHaveLength(1);
  });

  it("does not reconcile a count that leaves units unexplained", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({
      id: "fair-1",
      name: "Feria",
      status: "RECONCILING",
      inventoryItems: [
        {
          id: "item-1",
          productId: "p1",
          allocatedQuantity: 5,
          soldQuantity: 2,
          product: { id: "p1", name: "Cuaderno", stock: 10, acqPrice: 4000, price: 9000 },
        },
      ],
    });
    await expect(
      reconcileFairEvent({
        storeId: "s",
        fairEventId: "fair-1",
        items: [{ productId: "p1", returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 }],
        userId: "u",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(resilientBatch).not.toHaveBeenCalled();
  });
});

describe("cancelFairSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    prisma.fairEventInventoryItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.fairCapsule.findMany.mockResolvedValue([]);
    prisma.order.update.mockImplementation(async ({ data }) => ({ id: "o1", ...data }));
  });

  it("refuses once the fair is closed", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "CLOSED", name: "F" });
    await expect(
      cancelFairSale({ storeId: "s", fairEventId: "fair-1", orderId: "o1", userId: "u" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("returns the sold counters to the fair, restores a sold capsule and clears paidAt, without touching the kardex", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "RECONCILING", name: "F" });
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "o1",
      type: "FESTIVAL",
      status: "PAID",
      adminNotes: "Venta presencial · F",
      orderItems: [
        { id: "oi-direct", productId: "p1", quantity: 2 },
        { id: "oi-capsule", productId: "p2", quantity: 1 },
      ],
    });
    prisma.fairCapsule.findMany.mockResolvedValueOnce([
      { id: "cap-1", productId: "p2", orderItemId: "oi-capsule" },
    ]);

    const result = await cancelFairSale({ storeId: "s", fairEventId: "fair-1", orderId: "o1", userId: "u" });

    expect(prisma.fairEventInventoryItem.updateMany).toHaveBeenCalledWith({
      where: { fairEventId: "fair-1", productId: "p1", soldQuantity: { gte: 2 } },
      data: { soldQuantity: { decrement: 2 } },
    });
    expect(prisma.fairEventInventoryItem.updateMany).toHaveBeenCalledWith({
      where: { fairEventId: "fair-1", productId: "p2", soldQuantity: { gte: 1 } },
      data: { soldQuantity: { decrement: 1 }, packedQuantity: { increment: 1 } },
    });
    expect(prisma.fairCapsule.update).toHaveBeenCalledWith({
      where: { id: "cap-1" },
      data: { status: "PACKED", orderItemId: null, soldAt: null },
    });
    expect(result).toMatchObject({ status: "CANCELLED", paidAt: null });
    expect(resilientBatch).not.toHaveBeenCalled();
    expect(queueSync).not.toHaveBeenCalled();
  });

  it("is a no-op for a sale that is already cancelled", async () => {
    prisma.fairEvent.findFirst.mockResolvedValueOnce({ id: "fair-1", status: "OPEN", name: "F" });
    prisma.order.findFirst.mockResolvedValueOnce({ id: "o1", type: "FESTIVAL", status: "CANCELLED", orderItems: [] });
    await expect(
      cancelFairSale({ storeId: "s", fairEventId: "fair-1", orderId: "o1", userId: "u" }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
