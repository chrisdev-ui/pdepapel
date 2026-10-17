import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { recalculateKitStock } from "@/lib/inventory";
import {
  InventoryMovementType,
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

describe("point of sale flow with MySQL", () => {
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

  it("creates one paid sale, explodes kits, and records physical inventory movements", async () => {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);

    const sale = await createPointOfSaleSale({
      storeId: fixture.store.id,
      items: [{ productId: fixture.kit.id, quantity: 2 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "point-of-sale-kit-sale-001",
      userId: fixture.store.userId,
    });
    const duplicateSale = await createPointOfSaleSale({
      storeId: fixture.store.id,
      items: [{ productId: fixture.kit.id, quantity: 2 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: "point-of-sale-kit-sale-001",
      userId: fixture.store.userId,
    });

    expect(sale).toMatchObject({ duplicate: false });
    expect(duplicateSale).toMatchObject({
      duplicate: true,
      order: { id: sale.order.id },
    });
    expect(sale.order).toMatchObject({
      status: OrderStatus.PAID,
      type: OrderType.POINT_OF_SALE,
      payment: { method: PaymentMethod.CASH },
      total: 20000,
      totalProductCost: 16000,
    });
    expect(sale.order.orderItems).toEqual([
      expect.objectContaining({ productId: fixture.kit.id, quantity: 2 }),
    ]);

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 2 });
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.kit.id } }),
    ).resolves.toMatchObject({ stock: 1 });
    await expect(
      testPrisma.inventoryMovement.findMany({
        where: { referenceId: sale.order.id },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        productId: fixture.component.id,
        type: InventoryMovementType.IN_PERSON_SALE,
        quantity: -4,
        previousStock: 6,
        newStock: 2,
      }),
    ]);
  });

  it("el costo de la venta suma el envío por unidad de las piezas; sin él, el pedido lo dice", async () => {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const sell = (key: string) =>
      createPointOfSaleSale({ storeId: fixture!.store.id, items: [{ productId: fixture!.kit.id, quantity: 1 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: key, userId: fixture!.store.userId });

    expect((await sell("pos-envio-sin-dato")).order).toMatchObject({ totalProductCost: 8000, productShippingCost: 0, productShippingMissing: true });

    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { transportationCost: 500 } });
    // 2 piezas × (4.000 + 500) = 9.000.
    expect((await sell("pos-envio-con-dato")).order).toMatchObject({ totalProductCost: 9000, productShippingCost: 1000, productShippingMissing: false, netProfit: 1000 });
  });

  it("rejects insufficient combined product and kit stock without a partial sale", async () => {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);

    await expect(
      createPointOfSaleSale({
        storeId: fixture.store.id,
        items: [
          { productId: fixture.component.id, quantity: 3 },
          { productId: fixture.kit.id, quantity: 2 },
        ],
        paymentMethod: PaymentMethod.BankTransfer,
        transactionId: "REF-0001",
        idempotencyKey: "point-of-sale-insufficient-001",
        userId: fixture.store.userId,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(
      testPrisma.product.findUniqueOrThrow({
        where: { id: fixture.component.id },
      }),
    ).resolves.toMatchObject({ stock: 6 });
    await expect(
      testPrisma.order.count({ where: { storeId: fixture.store.id } }),
    ).resolves.toBe(0);
    await expect(
      testPrisma.inventoryMovement.count({
        where: { storeId: fixture.store.id },
      }),
    ).resolves.toBe(0);
  });
});
