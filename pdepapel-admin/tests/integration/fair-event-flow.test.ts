import {
  allocateFairInventory,
  createFairSale,
  openFairEvent,
  packFairCapsules,
  reconcileFairEvent,
} from "@/lib/fair-events";
import {
  FairCapsuleStatus,
  FairEventStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("fair event flow with MySQL", () => {
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

  it("reserves online stock, records paid direct and capsule sales, then returns only counted units", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: {
        storeId: fixture.store.id,
        name: "Feria de pruebas",
        createdBy: fixture.store.userId,
      },
    });

    await allocateFairInventory({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: fixture.component.id, quantity: 4 }],
      userId: fixture.store.userId,
    });

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 2 });

    const [capsule] = await packFairCapsules({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      productId: fixture.component.id,
      quantity: 1,
      salePrice: 10000,
      minimumMarginPct: 30,
    });
    await openFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
    });

    const sale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        { productId: fixture.component.id, quantity: 1 },
        { capsuleCode: capsule.code },
      ],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-test-sale-001",
      userId: fixture.store.userId,
    });
    const duplicateSale = await createFairSale({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [{ productId: fixture.component.id, quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "fair-event-test-sale-001",
      userId: fixture.store.userId,
    });

    expect(sale.duplicate).toBe(false);
    expect(duplicateSale).toMatchObject({
      duplicate: true,
      order: { id: sale.order.id },
    });
    expect(sale.order).toMatchObject({
      status: OrderStatus.PAID,
      type: OrderType.FESTIVAL,
      paidAt: expect.any(Date),
      payment: { method: PaymentMethod.CASH },
    });
    expect(sale.order.orderItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Componente", quantity: 1 }),
        expect.objectContaining({ name: "Cápsula sorpresa", quantity: 1 }),
      ]),
    );

    await expect(
      testPrisma.fairCapsule.findUniqueOrThrow({ where: { id: capsule.id } }),
    ).resolves.toMatchObject({ status: FairCapsuleStatus.SOLD });

    await reconcileFairEvent({
      storeId: fixture.store.id,
      fairEventId: fairEvent.id,
      items: [
        {
          productId: fixture.component.id,
          returnedQuantity: 2,
          damagedQuantity: 0,
          lostQuantity: 0,
        },
      ],
      userId: fixture.store.userId,
    });

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 4 });
    await expect(
      testPrisma.fairEvent.findUniqueOrThrow({ where: { id: fairEvent.id } }),
    ).resolves.toMatchObject({ status: FairEventStatus.CLOSED });
    await expect(
      testPrisma.inventoryMovement.findMany({
        where: { storeId: fixture.store.id },
        orderBy: { createdAt: "asc" },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "FESTIVAL_ALLOCATION", quantity: -4 }),
        expect.objectContaining({ type: "FESTIVAL_RETURN", quantity: 2 }),
      ]),
    );
  });

  it("does not reserve a derived kit as independent fair inventory", async () => {
    fixture = await createInventoryFixture();
    const fairEvent = await testPrisma.fairEvent.create({
      data: {
        storeId: fixture.store.id,
        name: "Feria de kits de prueba",
        createdBy: fixture.store.userId,
      },
    });

    await expect(
      allocateFairInventory({
        storeId: fixture.store.id,
        fairEventId: fairEvent.id,
        allocations: [{ productId: fixture.kit.id, quantity: 1 }],
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      testPrisma.fairEventInventoryItem.count({
        where: { fairEventId: fairEvent.id },
      }),
    ).resolves.toBe(0);
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } }),
    ).resolves.toMatchObject({ stock: 0 });
  });
});
