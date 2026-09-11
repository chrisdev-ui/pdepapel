import {
  MarketplaceInventoryStatus,
  MarketplaceOrderStatus,
  MarketplaceOutboxAction,
  MarketplaceProvider,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";
import { confirmMercadoLibreOrderReturn } from "@/lib/mercadolibre/order-restock";

// El despacho a QStash no forma parte de la prueba: solo importa lo que queda en la base.
vi.mock("@/lib/mercadolibre/queue", () => ({
  enqueueMercadoLibreOutboxEvent: vi.fn().mockResolvedValue(true),
}));

describe("Mercado Libre physical return confirmation with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.orderInventoryIssue.deleteMany({
        where: { storeId: fixture.store.id },
      });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("returns the physical units of a cancelled kit sale, once, and re-syncs the listings", async () => {
    fixture = await createInventoryFixture();
    const connection = await testPrisma.marketplaceConnection.create({
      data: {
        storeId: fixture.store.id,
        provider: MarketplaceProvider.MERCADOLIBRE,
        status: "CONNECTED",
      },
    });
    const kitListing = await testPrisma.marketplaceListing.create({
      data: {
        connectionId: connection.id,
        productId: fixture.kit.id,
        externalItemId: "MCO-KIT",
        status: "ACTIVE",
      },
    });
    // La venta descontó 1 kit = 2 componentes (6 → 4) y luego fue cancelada.
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { stock: 4 },
    });
    const order = await testPrisma.marketplaceOrder.create({
      data: {
        connectionId: connection.id,
        externalOrderId: "2000017813937484",
        status: MarketplaceOrderStatus.CANCELLED,
        inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
        inventoryAppliedAt: new Date(),
        inventoryError: "La venta fue cancelada. Confirma el retorno físico antes de devolver unidades al inventario.",
        totalAmount: 20000,
        items: {
          create: [
            {
              listingId: kitListing.id,
              productId: fixture.kit.id,
              externalItemId: "MCO-KIT",
              title: "Kit",
              quantity: 1,
              unitPrice: 20000,
            },
          ],
        },
      },
    });

    const result = await confirmMercadoLibreOrderReturn({
      storeId: fixture.store.id,
      externalOrderId: "2000017813937484",
      userId: fixture.store.userId,
    });

    expect(result).toMatchObject({ returned: 2, issues: 0, alreadyRestocked: false });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 6 });
    // El kit no tiene stock propio: se recalcula desde el componente (6 / 2 = 3).
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } }),
    ).resolves.toMatchObject({ stock: 3 });
    await expect(
      testPrisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({
      inventoryStatus: MarketplaceInventoryStatus.RESTOCKED,
      inventoryError: null,
      inventoryRestockedAt: expect.any(Date),
    });
    await expect(
      testPrisma.inventoryMovement.findMany({
        where: { storeId: fixture.store.id, referenceId: order.id },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: fixture.component.id,
        type: "ORDER_CANCELLED",
        quantity: 2,
        reason: expect.stringContaining("retorno físico confirmado 2000017813937484 (Kit: Kit)"),
      }),
    ]);
    await expect(
      testPrisma.marketplaceOutboxEvent.findMany({
        where: { connectionId: connection.id, action: MarketplaceOutboxAction.SYNC_STOCK },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ listingId: kitListing.id, payload: { targetQuantity: 3 } }),
    ]);
    await expect(
      testPrisma.orderInventoryIssue.count({ where: { storeId: fixture.store.id } }),
    ).resolves.toBe(0);

    // Una segunda confirmación no devuelve nada más.
    await expect(
      confirmMercadoLibreOrderReturn({
        storeId: fixture.store.id,
        externalOrderId: "2000017813937484",
        userId: fixture.store.userId,
      }),
    ).resolves.toMatchObject({ alreadyRestocked: true, returned: 0 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 6 });
  });

  it("refuses a paid sale whose inventory is still applied", async () => {
    fixture = await createInventoryFixture();
    const connection = await testPrisma.marketplaceConnection.create({
      data: {
        storeId: fixture.store.id,
        provider: MarketplaceProvider.MERCADOLIBRE,
        status: "CONNECTED",
      },
    });
    await testPrisma.marketplaceOrder.create({
      data: {
        connectionId: connection.id,
        externalOrderId: "2000017813937485",
        status: MarketplaceOrderStatus.PAID,
        inventoryStatus: MarketplaceInventoryStatus.DECREMENTED,
        totalAmount: 10000,
        items: {
          create: [
            { productId: fixture.component.id, externalItemId: "MCO-C", title: "Componente", quantity: 1, unitPrice: 10000 },
          ],
        },
      },
    });
    await expect(
      confirmMercadoLibreOrderReturn({
        storeId: fixture.store.id,
        externalOrderId: "2000017813937485",
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } }),
    ).resolves.toMatchObject({ stock: 6 });
  });
});
