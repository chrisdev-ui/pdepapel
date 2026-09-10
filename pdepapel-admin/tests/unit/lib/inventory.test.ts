import {
  assertNotKitProducts,
  createInventoryMovement,
  createInventoryMovementBatch,
  createInventoryMovementBatchResilient,
  explodeSaleLines,
  recalculateKitStock,
  validateStockAvailability,
} from "@/lib/inventory";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mercadolibre/outbox", () => ({
  queueMarketplaceStockSyncEvents: vi.fn(),
}));

describe("inventory movements", () => {
  it("creates an auditable movement and applies an atomic stock decrement", async () => {
    const movement = { id: "movement-id" };
    const tx = {
      product: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ stock: 5, name: "Agenda" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

    expect(tx.product.findFirst).toHaveBeenCalledWith({
      where: { id: "product-id", storeId: "store-id" },
      select: { stock: true, name: true },
    });
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
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "product-id",
        storeId: "store-id",
        stock: { gte: 3 },
      },
      data: { stock: { decrement: 3 } },
    });
  });

  it("rejects a decrement that no longer has enough stock without writing a movement", async () => {
    const tx = {
      product: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ stock: 2, name: "Agenda" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryMovement: { create: vi.fn() },
      productKit: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      createInventoryMovement(tx as any, {
        productId: "product-id",
        storeId: "store-id",
        type: "ORDER_PLACED",
        quantity: -3,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
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
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "product-id", name: "Agenda", stock: 8 }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
          // resolucion: el kit se expande a sus componentes
          .mockResolvedValueOnce([
            {
              id: "kit-id",
              isKit: true,
              kitComponents: [{ componentId: "component-id", quantity: 2 }],
            },
          ])
          .mockResolvedValueOnce([
            { id: "component-id", isKit: false, kitComponents: [] },
          ])
          // validacion final sobre la demanda fisica
          .mockResolvedValueOnce([
            { id: "component-id", name: "Sticker", stock: 4 },
          ]),
      },
    };

    await expect(
      validateStockAvailability(tx as any, [
        { productId: "kit-id", quantity: 2 },
      ]),
    ).resolves.toBeUndefined();
    // 2 kits x 2 stickers = 4, y hay 4: pasa justo.
    expect(tx.product.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["component-id"] } },
      select: { id: true, stock: true, name: true },
    });
  });

  it("suma la demanda directa y la que viene dentro de un kit", async () => {
    // Regresion: antes se validaba en dos pasadas independientes, asi que un
    // carrito con 10 unidades sueltas de A mas un kit que tambien lleva A
    // pasaba la validacion teniendo solo 10 en bodega.
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "component-id", isKit: false, kitComponents: [] },
            {
              id: "kit-id",
              isKit: true,
              kitComponents: [{ componentId: "component-id", quantity: 1 }],
            },
          ])
          .mockResolvedValueOnce([
            { id: "component-id", isKit: false, kitComponents: [] },
          ])
          .mockResolvedValueOnce([
            { id: "component-id", name: "Sticker", stock: 10 },
          ]),
      },
    };

    await expect(
      validateStockAvailability(tx as any, [
        { productId: "component-id", quantity: 10 },
        { productId: "kit-id", quantity: 1 },
      ]),
    ).rejects.toMatchObject({
      details: {
        items: [
          {
            productId: "component-id",
            productName: "Sticker",
            available: 10,
            requested: 11,
          },
        ],
      },
    });
  });

  it("bloquea un ajuste manual sobre un kit", async () => {
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "kit-id", name: "Kit creativo" }]),
      },
    };

    await expect(
      assertNotKitProducts(tx as any, ["kit-id"]),
    ).rejects.toThrowError(/no admite ajustes manuales/);
    expect(tx.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["kit-id"] }, isKit: true },
      select: { id: true, name: true },
    });
  });

  it("deja pasar un ajuste manual sobre un producto normal", async () => {
    const tx = { product: { findMany: vi.fn().mockResolvedValue([]) } };
    await expect(
      assertNotKitProducts(tx as any, ["product-id"]),
    ).resolves.toBeUndefined();
  });

  it("explodeSaleLines reemplaza el kit por sus componentes", async () => {
    const tx = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "kit-id",
              name: "Kit creativo",
              kitComponents: [
                { componentId: "a", quantity: 2 },
                { componentId: "b", quantity: 1 },
              ],
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };

    await expect(
      explodeSaleLines(tx as any, [
        { productId: "kit-id", quantity: 3 },
        { productId: "suelto", quantity: 4 },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        physicalProductId: "suelto",
        physicalQuantity: 4,
        kitId: null,
        kitName: null,
      }),
      expect.objectContaining({
        physicalProductId: "a",
        physicalQuantity: 6,
        kitId: "kit-id",
        kitName: "Kit creativo",
      }),
      expect.objectContaining({
        physicalProductId: "b",
        physicalQuantity: 3,
        kitId: "kit-id",
        kitName: "Kit creativo",
      }),
    ]);
  });

  it("processes resilient batches without blocking valid products", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValueOnce([
          { id: "available", name: "Agenda", stock: 3 },
          { id: "empty", name: "Llavero", stock: 0 },
        ]),
        findFirst: vi
          .fn()
          .mockResolvedValue({ stock: 3, name: "Agenda" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
