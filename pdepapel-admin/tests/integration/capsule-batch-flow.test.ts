import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { packCapsules, unpackCapsuleBatch } from "@/lib/capsule-batches";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { priceLines } from "@/lib/product-pricing";
import { OrderType, PaymentMethod } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Empacar cápsulas es una transferencia de stock: lo que entra sale de bodega
 * y aparece como cápsulas. Lo que estas pruebas cuidan es que las dos patas
 * vayan siempre juntas —o ninguna—, porque un lote a medias deja unidades
 * descontadas que no están dentro de nada.
 */

async function createFixture() {
  const suffix = randomUUID();
  const store = await testPrisma.store.create({
    data: { name: `Cápsulas ${suffix}`, userId: `test-user-${suffix}` },
  });
  const type = await testPrisma.type.create({
    data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId: store.id },
  });
  const normalCategory = await testPrisma.category.create({
    data: { name: "Agendas", slug: `agendas-${suffix}`, storeId: store.id, typeId: type.id },
  });
  // La categoría real de producción, con su id: `packCapsules` la exige.
  const capsuleCategory = await testPrisma.category.upsert({
    where: { id: CAPSULAS_SORPRESA_ID },
    update: {},
    create: {
      id: CAPSULAS_SORPRESA_ID,
      name: "Kits sorpresa",
      slug: `kits-sorpresa-${suffix}`,
      storeId: store.id,
      typeId: type.id,
    },
  });
  const size = await testPrisma.size.create({
    data: { name: "Único", value: `u-${suffix}`, storeId: store.id },
  });
  const color = await testPrisma.color.create({
    data: { name: "Sorpresa", value: `sorpresa-${suffix}`, storeId: store.id },
  });
  const design = await testPrisma.design.create({
    data: { name: "Sorpresa", storeId: store.id },
  });

  const makeProduct = (name: string, stock: number, acqPrice: number, categoryId: string, price = 10000) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
        description: "Producto de pruebas",
        stock,
        price,
        acqPrice,
        sku: `CAP-${suffix}-${name}`,
        storeId: store.id,
        categoryId,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });

  const stickers = await makeProduct("Stickers", 40, 2000, normalCategory.id);
  const lapicero = await makeProduct("Lapicero", 30, 3000, normalCategory.id);
  const capsule = await makeProduct("Capsula sorpresa", 0, 0, capsuleCategory.id, 12000);

  return { store, stickers, lapicero, capsule, suffix };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function deleteFixture(fixture: Fixture) {
  const productIds = [fixture.stickers.id, fixture.lapicero.id, fixture.capsule.id];
  await testPrisma.orderItem.deleteMany({ where: { productId: { in: productIds } } });
  await testPrisma.paymentDetails.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.order.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.capsuleBatchItem.deleteMany({ where: { productId: { in: productIds } } });
  await testPrisma.capsuleBatch.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.productPriceTier.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
  await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { productId: { in: productIds } } });
  await testPrisma.product.deleteMany({ where: { id: { in: productIds } } });
  await testPrisma.category.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.size.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.color.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.design.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.type.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.store.delete({ where: { id: fixture.store.id } });
}

describe("lotes de cápsulas contra MySQL", () => {
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("empacar baja el stock de los orígenes y sube el de la cápsula", async () => {
    fixture = await createFixture();
    const batch = await packCapsules({
      storeId: fixture.store.id,
      capsuleProductId: fixture.capsule.id,
      quantity: 10,
      sources: [
        { productId: fixture.stickers.id, quantity: 10 },
        { productId: fixture.lapicero.id, quantity: 10 },
      ],
      userId: "test-user",
    });

    // 10 × 2.000 + 10 × 3.000 = 50.000 → 5.000 por cápsula.
    expect(batch.totalCost).toBe(50000);
    expect(batch.unitCost).toBe(5000);

    const [stickers, lapicero, capsule] = await Promise.all([
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.stickers.id } }),
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.lapicero.id } }),
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.capsule.id } }),
    ]);
    expect(stickers.stock).toBe(30);
    expect(lapicero.stock).toBe(20);
    expect(capsule.stock).toBe(10);
    // El costo de la cápsula queda en el del lote, que es de donde sale el margen.
    expect(Number(capsule.acqPrice)).toBe(5000);

    // Las dos patas quedan enlazadas por el id del lote, como VARIANT_CONVERSION.
    const movements = await testPrisma.inventoryMovement.findMany({
      where: { referenceId: batch.id },
    });
    expect(movements).toHaveLength(3);
    expect(movements.every((movement) => movement.type === "CAPSULE_PACKED")).toBe(true);
    expect(movements.reduce((total, movement) => total + movement.quantity, 0)).toBe(-10);
  });

  it("si un origen no alcanza, no se descuenta nada de nada", async () => {
    fixture = await createFixture();
    await expect(
      packCapsules({
        storeId: fixture.store.id,
        capsuleProductId: fixture.capsule.id,
        quantity: 5,
        sources: [
          { productId: fixture.stickers.id, quantity: 5 },
          { productId: fixture.lapicero.id, quantity: 999 },
        ],
        userId: "test-user",
      }),
    ).rejects.toThrow();

    const [stickers, capsule] = await Promise.all([
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.stickers.id } }),
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.capsule.id } }),
    ]);
    // Lo que importa: el producto que SÍ alcanzaba tampoco se tocó.
    expect(stickers.stock).toBe(40);
    expect(capsule.stock).toBe(0);
    expect(await testPrisma.capsuleBatch.count({ where: { storeId: fixture.store.id } })).toBe(0);
  });

  it("un origen sin costo registrado no se puede empacar", async () => {
    fixture = await createFixture();
    await testPrisma.product.update({
      where: { id: fixture.stickers.id },
      data: { acqPrice: 0 },
    });
    await expect(
      packCapsules({
        storeId: fixture.store.id,
        capsuleProductId: fixture.capsule.id,
        quantity: 5,
        sources: [{ productId: fixture.stickers.id, quantity: 5 }],
        userId: "test-user",
      }),
    ).rejects.toThrow(/costo/i);
  });

  it("deshacer un lote devuelve las unidades a sus productos", async () => {
    fixture = await createFixture();
    const batch = await packCapsules({
      storeId: fixture.store.id,
      capsuleProductId: fixture.capsule.id,
      quantity: 10,
      sources: [{ productId: fixture.stickers.id, quantity: 20 }],
      userId: "test-user",
    });

    await unpackCapsuleBatch({
      storeId: fixture.store.id,
      batchId: batch.id,
      userId: "test-user",
    });

    const [stickers, capsule] = await Promise.all([
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.stickers.id } }),
      testPrisma.product.findUniqueOrThrow({ where: { id: fixture.capsule.id } }),
    ]);
    expect(stickers.stock).toBe(40);
    expect(capsule.stock).toBe(0);
  });

  it("un lote con cápsulas ya vendidas no se puede deshacer", async () => {
    fixture = await createFixture();
    const batch = await packCapsules({
      storeId: fixture.store.id,
      capsuleProductId: fixture.capsule.id,
      quantity: 10,
      sources: [{ productId: fixture.stickers.id, quantity: 20 }],
      userId: "test-user",
    });

    // Se vende una: el stock de la cápsula baja a 9.
    await testPrisma.product.update({
      where: { id: fixture.capsule.id },
      data: { stock: 9 },
    });

    await expect(
      unpackCapsuleBatch({
        storeId: fixture.store.id,
        batchId: batch.id,
        userId: "test-user",
      }),
    ).rejects.toThrow(/vendieron/i);
  });

  it("la escalera por cantidad decide el precio, y nunca se suma a la oferta", async () => {
    fixture = await createFixture();
    await testPrisma.productPriceTier.createMany({
      data: [
        { storeId: fixture.store.id, productId: fixture.capsule.id, minQuantity: 5, unitPrice: 11000 },
        { storeId: fixture.store.id, productId: fixture.capsule.id, minQuantity: 10, unitPrice: 10500 },
      ],
    });

    const one = await priceLines(fixture.store.id, [
      { productId: fixture.capsule.id, quantity: 1 },
    ]);
    expect(one.get(fixture.capsule.id)?.unitPrice).toBe(12000);
    expect(one.get(fixture.capsule.id)?.source).toBe("base");

    const five = await priceLines(fixture.store.id, [
      { productId: fixture.capsule.id, quantity: 5 },
    ]);
    expect(five.get(fixture.capsule.id)?.unitPrice).toBe(11000);
    expect(five.get(fixture.capsule.id)?.lineTotal).toBe(55000);

    const twelve = await priceLines(fixture.store.id, [
      { productId: fixture.capsule.id, quantity: 12 },
    ]);
    expect(twelve.get(fixture.capsule.id)?.unitPrice).toBe(10500);
    expect(twelve.get(fixture.capsule.id)?.source).toBe("tier");
    expect(twelve.get(fixture.capsule.id)?.tierMinQuantity).toBe(10);
  });

  it("una venta real del punto de venta cobra el peldaño, no el precio suelto", async () => {
    fixture = await createFixture();
    await packCapsules({
      storeId: fixture.store.id,
      capsuleProductId: fixture.capsule.id,
      quantity: 30,
      sources: [{ productId: fixture.stickers.id, quantity: 30 }],
      userId: "test-user",
    });
    await testPrisma.productPriceTier.createMany({
      data: [
        { storeId: fixture.store.id, productId: fixture.capsule.id, minQuantity: 5, unitPrice: 11000 },
        { storeId: fixture.store.id, productId: fixture.capsule.id, minQuantity: 10, unitPrice: 10500 },
      ],
    });

    const { order } = await createPointOfSaleSale({
      storeId: fixture.store.id,
      items: [{ productId: fixture.capsule.id, quantity: 12 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: `pos-${randomUUID()}`,
      userId: "test-user",
    });

    // 12 × 10.500 = 126.000. Sin escalera habrían sido 12 × 12.000 = 144.000.
    expect(order.subtotal).toBe(126000);
    expect(order.total).toBe(126000);
    expect(order.orderItems[0].price).toBe(10500);
    expect(order.type).toBe(OrderType.POINT_OF_SALE);

    const capsule = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.capsule.id },
    });
    expect(capsule.stock).toBe(18);
  });

  it("dos líneas del mismo producto suman para el peldaño: 5 + 5 cuesta lo mismo que 10", async () => {
    fixture = await createFixture();
    await testPrisma.productPriceTier.create({
      data: {
        storeId: fixture.store.id,
        productId: fixture.capsule.id,
        minQuantity: 10,
        unitPrice: 10500,
      },
    });

    const split = await priceLines(fixture.store.id, [
      { productId: fixture.capsule.id, quantity: 5 },
      { productId: fixture.capsule.id, quantity: 5 },
    ]);
    expect(split.get(fixture.capsule.id)?.quantity).toBe(10);
    expect(split.get(fixture.capsule.id)?.unitPrice).toBe(10500);
  });
});
