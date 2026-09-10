import { explodeKitMovements } from "@/lib/order-stock-movements";
import {
  assertNotKitProducts,
  createInventoryMovementBatchResilient,
  explodeSaleLines,
  recalculateKitStock,
  validateStockAvailability,
} from "@/lib/inventory";
import { getProductUnitCost } from "@/lib/financial";
import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * El kit de la fixture lleva 2 unidades del componente, y el componente
 * arranca con 6 en bodega: se pueden armar 3 kits.
 */
describe("integridad de dinero e inventario en kits", () => {
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

  it("devolver un kit devuelve tambien sus componentes", async () => {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]);

    const sell = await explodeKitMovements(testPrisma, [
      {
        productId: fixture.kit.id,
        storeId: fixture.store.id,
        type: "ORDER_PLACED" as const,
        quantity: -1,
        referenceId: "orden-de-prueba",
      },
    ]);
    await createInventoryMovementBatchResilient(testPrisma, sell);

    const afterSale = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
    });
    expect(afterSale.stock).toBe(4);

    // Esta es la ruta que antes NO explotaba el kit: al eliminar el pedido el
    // kit recuperaba una unidad fantasma y el componente se perdia del libro.
    const restock = await explodeKitMovements(testPrisma, [
      {
        productId: fixture.kit.id,
        storeId: fixture.store.id,
        type: "ORDER_CANCELLED" as const,
        quantity: 1,
        referenceId: "orden-de-prueba",
      },
    ]);
    await createInventoryMovementBatchResilient(testPrisma, restock);

    const afterDelete = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
    });
    // Venta y devolucion son simetricas: vuelve a 6, no se queda en 4.
    expect(afterDelete.stock).toBe(6);

    const kit = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.kit.id },
    });
    expect(kit.stock).toBe(3);
  });

  it("suma la demanda directa y la que va dentro del kit", async () => {
    fixture = await createInventoryFixture();

    // 6 en bodega. 5 sueltas + 1 kit (que lleva 2) = 7 requeridas.
    await expect(
      validateStockAvailability(testPrisma, [
        { productId: fixture.component.id, quantity: 5 },
        { productId: fixture.kit.id, quantity: 1 },
      ]),
    ).rejects.toMatchObject({ statusCode: 422 });

    // 4 sueltas + 1 kit = 6 requeridas: cabe justo.
    await expect(
      validateStockAvailability(testPrisma, [
        { productId: fixture.component.id, quantity: 4 },
        { productId: fixture.kit.id, quantity: 1 },
      ]),
    ).resolves.toBeUndefined();
  });

  it("un ajuste manual sobre un kit se rechaza", async () => {
    fixture = await createInventoryFixture();

    await expect(
      assertNotKitProducts(testPrisma, [fixture.kit.id]),
    ).rejects.toThrowError(/no admite ajustes manuales/);

    await expect(
      assertNotKitProducts(testPrisma, [fixture.component.id]),
    ).resolves.toBeUndefined();
  });

  it("el costo de un kit sale de sus componentes, no de su propio acqPrice", async () => {
    fixture = await createInventoryFixture();

    const kit = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.kit.id },
      select: {
        acqPrice: true,
        isKit: true,
        kitComponents: {
          select: { quantity: true, component: { select: { acqPrice: true } } },
        },
      },
    });

    // El kit tiene acqPrice 4.000 propio, pero lleva 2 componentes de 4.000.
    expect(Number(kit.acqPrice)).toBe(4000);
    expect(getProductUnitCost(kit)).toBe(8000);
  });

  it("explodeSaleLines reemplaza el kit por sus componentes fisicos", async () => {
    fixture = await createInventoryFixture();

    const lines = await explodeSaleLines(testPrisma, [
      { productId: fixture.kit.id, quantity: 3 },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      physicalProductId: fixture.component.id,
      physicalQuantity: 6,
      kitId: fixture.kit.id,
    });
  });
});
