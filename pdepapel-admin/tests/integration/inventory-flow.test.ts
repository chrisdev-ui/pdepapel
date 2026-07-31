import {
  createInventoryMovement,
  createInventoryMovementBatch,
  recalculateKitStock,
  validateStockAvailability,
} from "@/lib/inventory";
import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

describe("inventory flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("writes sequential audit snapshots and updates stock atomically", async () => {
    fixture = await createInventoryFixture();

    await createInventoryMovementBatch(testPrisma, [
      {
        productId: fixture.component.id,
        storeId: fixture.store.id,
        type: "ORDER_PLACED",
        quantity: -2,
        referenceId: "test-order",
      },
      {
        productId: fixture.component.id,
        storeId: fixture.store.id,
        type: "RETURN",
        quantity: 1,
        referenceId: "test-return",
      },
    ]);

    const product = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
    });
    const movements = await testPrisma.inventoryMovement.findMany({
      where: { productId: fixture.component.id },
      orderBy: { createdAt: "asc" },
    });

    expect(product.stock).toBe(5);
    expect(movements).toMatchObject([
      { previousStock: 6, newStock: 4, quantity: -2 },
      { previousStock: 4, newStock: 5, quantity: 1 },
    ]);
  });

  it("recalculates kit stock after a component movement and prevents overselling", async () => {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);

    await createInventoryMovement(testPrisma, {
      productId: fixture.component.id,
      storeId: fixture.store.id,
      type: "ORDER_PLACED",
      quantity: -2,
      referenceId: "test-order",
    });

    const kit = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.kit.id },
    });

    expect(kit.stock).toBe(2);
    await expect(
      validateStockAvailability(testPrisma, [
        { productId: fixture.component.id, quantity: 5 },
      ]),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
