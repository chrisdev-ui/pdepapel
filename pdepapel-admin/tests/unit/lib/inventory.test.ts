import {
  createInventoryMovement,
  createInventoryMovementBatch,
  createInventoryMovementBatchResilient,
  recalculateKitStock,
  validateStockAvailability,
} from "@/lib/inventory";
import { describe, expect, it, vi } from "vitest";

describe("inventory movements", () => {
  it("creates an auditable movement and applies an atomic stock decrement", async () => {
    const movement = { id: "movement-id" };
    const tx = {
      product: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ stock: 5, name: "Agenda" }),
        update: vi.fn(),
      },
      inventoryMovement: { create: vi.fn().mockResolvedValue(movement) },
      productKit: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      createInventoryMovement(tx as any, {
        productId: "product-id",
        storeId: "store-id",
        type: "ORDER_PLACED",
        quantity: -3,
        reason: "Pedido pagado",
        referenceId: "order-id",
      }),
    ).resolves.toEqual(movement);

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-id",
        storeId: "store-id",
        quantity: -3,
        previousStock: 5,
        newStock: 2,
        referenceId: "order-id",
      }),
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "product-id" },
      data: { stock: { decrement: 3 } },
    });
  });

  it("calculates kit availability from its most limited component", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "kit-id",
            kitComponents: [
              { quantity: 2, component: { stock: 10 } },
              { quantity: 1, component: { stock: 3 } },
            ],
          },
          { id: "empty-kit", kitComponents: [] },
        ]),
        update: vi.fn(),
      },
    };

    await recalculateKitStock(tx as any, ["kit-id", "empty-kit"]);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "kit-id" },
      data: { stock: 3 },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "empty-kit" },
      data: { stock: 0 },
    });
  });

  it("keeps sequential movement snapshots correct for duplicate products", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: "product-id", stock: 8 }]),
        update: vi.fn(),
      },
      inventoryMovement: { create: vi.fn() },
      productKit: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await createInventoryMovementBatch(
      tx as any,
      [
        {
          productId: "product-id",
          storeId: "store-id",
          type: "ORDER_PLACED",
          quantity: -2,
        },
        {
          productId: "product-id",
          storeId: "store-id",
          type: "RETURN",
          quantity: 1,
        },
      ],
      false,
    );

    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ previousStock: 8, newStock: 6 }),
      }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ previousStock: 6, newStock: 7 }),
      }),
    );
  });

  it("rejects orders when duplicate product lines exceed available stock", async () => {
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "product-id", name: "Agenda", stock: 3, isKit: false },
          ]),
      },
    };

    await expect(
      validateStockAvailability(tx as any, [
        { productId: "product-id", quantity: 2 },
        { productId: "product-id", quantity: 2 },
      ]),
    ).rejects.toMatchObject({
      statusCode: 422,
      details: {
        items: [
          {
            productId: "product-id",
            productName: "Agenda",
            available: 3,
            requested: 4,
          },
        ],
      },
    });
  });

  it("expands kits into their component requirements before validating stock", async () => {
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "kit-id", name: "Kit creativo", stock: 10, isKit: true },
          ])
          .mockResolvedValueOnce([
            {
              id: "kit-id",
              kitComponents: [{ componentId: "component-id", quantity: 2 }],
            },
          ])
          .mockResolvedValueOnce([
            { id: "component-id", name: "Sticker", stock: 4, isKit: false },
          ]),
      },
    };

    await expect(
      validateStockAvailability(tx as any, [
        { productId: "kit-id", quantity: 2 },
      ]),
    ).resolves.toBeUndefined();
    expect(tx.product.findMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["kit-id"] } },
      include: { kitComponents: true },
    });
  });

  it("processes resilient batches without blocking valid products", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValueOnce([
          { id: "available", name: "Agenda", stock: 3 },
          { id: "empty", name: "Llavero", stock: 0 },
        ]),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ stock: 3, name: "Agenda" }),
        update: vi.fn(),
      },
      inventoryMovement: { create: vi.fn() },
      productKit: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      createInventoryMovementBatchResilient(tx as any, [
        {
          productId: "available",
          storeId: "store-id",
          type: "ORDER_PLACED",
          quantity: -2,
        },
        {
          productId: "empty",
          storeId: "store-id",
          type: "ORDER_PLACED",
          quantity: -1,
        },
        {
          productId: "missing",
          storeId: "store-id",
          type: "ORDER_PLACED",
          quantity: -1,
        },
      ]),
    ).resolves.toEqual({
      success: [
        { productId: "available", quantity: -2, productName: "Agenda" },
      ],
      failed: [
        {
          productId: "empty",
          quantity: -1,
          productName: "Llavero",
          reason: "Stock insuficiente. Disponible: 0",
        },
        {
          productId: "missing",
          quantity: -1,
          productName: "Desconocido",
          reason: "Producto no encontrado",
        },
      ],
    });
  });
});
