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

/**
 * El kardex guarda `previousStock` y `newStock` leídos ANTES de escribir, así
 * que solo cuadra si dos movimientos del mismo producto no se confirman a la
 * vez. Bajar el aislamiento no rompería el stock, pero sí la auditoría.
 */
describe("dos ventas del mismo producto a la vez", () => {
  let fixture: InventoryFixture | undefined;

  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  const vender = (productId: string, storeId: string, units: number) =>
    testPrisma.$transaction((tx) =>
      createInventoryMovement(tx, {
        productId,
        storeId,
        type: "ORDER_PLACED",
        quantity: -units,
        reason: "Venta simultánea",
        createdBy: "TEST",
      }),
    );

  it("ni el stock ni el kardex se desajustan", async () => {
    fixture = await createInventoryFixture(); // componente con 6 unidades

    const resultados = await Promise.allSettled([
      vender(fixture.component.id, fixture.store.id, 1),
      vender(fixture.component.id, fixture.store.id, 1),
      vender(fixture.component.id, fixture.store.id, 1),
    ]);
    const confirmadas = resultados.filter(
      (r) => r.status === "fulfilled",
    ).length;

    const producto = await testPrisma.product.findUnique({
      where: { id: fixture.component.id },
      select: { stock: true },
    });
    expect(producto?.stock).toBe(6 - confirmadas);

    const movimientos = await testPrisma.inventoryMovement.findMany({
      where: { productId: fixture.component.id },
      orderBy: { createdAt: "asc" },
      select: { quantity: true, previousStock: true, newStock: true },
    });
    expect(movimientos).toHaveLength(confirmadas);

    // Cada fila encadena con la anterior: sin saltos ni repeticiones.
    let esperado = 6;
    for (const movimiento of movimientos) {
      expect(movimiento.previousStock).toBe(esperado);
      expect(movimiento.newStock).toBe(esperado + movimiento.quantity);
      esperado = movimiento.newStock;
    }
    expect(esperado).toBe(producto?.stock);
  });

  it("nadie se lleva la última unidad dos veces", async () => {
    fixture = await createInventoryFixture();
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { stock: 1 },
    });

    const resultados = await Promise.allSettled([
      vender(fixture.component.id, fixture.store.id, 1),
      vender(fixture.component.id, fixture.store.id, 1),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const producto = await testPrisma.product.findUnique({
      where: { id: fixture.component.id },
      select: { stock: true },
    });
    expect(producto?.stock).toBe(0);
  });
});
