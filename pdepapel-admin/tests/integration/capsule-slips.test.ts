import {
  CapsuleBatchMode,
  CapsuleCostStatus,
  CapsuleSlipKind,
  CapsuleSlipStatus,
  InventoryMovementType,
  MarketplaceConnectionStatus,
  MarketplaceOutboxAction,
  MarketplaceProvider,
  OrderStatus,
  PaymentMethod,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mail.send } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: vi.fn().mockResolvedValue(["paula@prueba.test"]) }));

import { availableStock, marketplaceAvailableStock } from "@/lib/available-stock";
import { unpackCapsuleBatch } from "@/lib/capsule-batches";
import { drawCapsuleSlip, finishCapsuleDraw, printCapsuleSlips, voidCapsuleSlips } from "@/lib/capsule-slips";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { checkReservationDrift } from "@/lib/stock-reservations-job";

import { testPrisma } from "./helpers/database";

/**
 * Papeles de una edición contra MySQL: imprimir aparta en el producto real
 * (la tienda, el punto de venta y Mercado Libre ven menos), sacar libera 1 y
 * baja 1 con el costo congelado, anular libera, y la revisión diaria de
 * descuadres cuenta los papeles impresos.
 */
async function createFixture() {
  const suffix = randomUUID();
  const store = await testPrisma.store.create({ data: { name: `Papeles ${suffix}`, userId: `test-user-${suffix}` } });
  const type = await testPrisma.type.create({ data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId: store.id } });
  const category = await testPrisma.category.create({ data: { name: "Escritorio", slug: `escritorio-${suffix}`, storeId: store.id, typeId: type.id } });
  const size = await testPrisma.size.create({ data: { name: "Único", value: `u-${suffix}`, storeId: store.id } });
  const color = await testPrisma.color.create({ data: { name: "Varios", value: `v-${suffix}`, storeId: store.id } });
  const design = await testPrisma.design.create({ data: { name: "Varios", storeId: store.id } });
  const make = (name: string, stock: number, acqPrice: number, price = 9000) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
        description: "Producto de pruebas",
        stock,
        price,
        acqPrice,
        sku: `PAP-${suffix}-${name}`,
        storeId: store.id,
        categoryId: category.id,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });
  const borrador = await make("Borrador", 10, 3500);
  const resaltador = await make("Resaltador", 6, 5000);
  const caro = await make("Libreta grande", 4, 9000);
  const regalo = await make("Stickers", 5, 1800);
  const editionProduct = await make("Edicion Escritorio", 0, 0, 12900);
  const otherProduct = await make("Edicion Otra", 0, 0, 12900);
  const edition = await testPrisma.capsuleEdition.create({
    data: { storeId: store.id, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 6000 },
  });
  // El tope del regalo sale de los packs de la edición (aquí 3.000); la otra edición no tiene packs con regalo.
  await testPrisma.capsulePackOption.create({ data: { editionId: edition.id, packSize: 30, giftMaxCost: 3000, giftMaxItems: 2, boxReserveCost: 3000 } });
  const otherEdition = await testPrisma.capsuleEdition.create({
    data: { storeId: store.id, number: 2, name: "Otra", theme: "otra", productId: otherProduct.id, costBandMin: 3000, costBandMax: 6000 },
  });
  return { store, borrador, resaltador, caro, regalo, editionProduct, otherProduct, edition, otherEdition };
}
type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function deleteFixture(f: Fixture) {
  const storeId = f.store.id;
  await testPrisma.capsuleSlip.deleteMany({ where: { storeId } });
  await testPrisma.capsuleOrder.deleteMany({ where: { storeId } });
  await testPrisma.capsuleBatchItem.deleteMany({ where: { batch: { storeId } } });
  await testPrisma.capsuleBatch.deleteMany({ where: { storeId } });
  await testPrisma.capsulePackOption.deleteMany({ where: { edition: { storeId } } });
  await testPrisma.capsuleEdition.deleteMany({ where: { storeId } });
  await testPrisma.orderItem.deleteMany({ where: { order: { storeId } } });
  await testPrisma.paymentDetails.deleteMany({ where: { storeId } });
  await testPrisma.order.deleteMany({ where: { storeId } });
  await testPrisma.inventoryMovement.deleteMany({ where: { storeId } });
  await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { product: { storeId } } });
  await testPrisma.marketplaceListing.deleteMany({ where: { connection: { storeId } } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { storeId } });
  await testPrisma.product.deleteMany({ where: { storeId } });
  await testPrisma.category.deleteMany({ where: { storeId } });
  await testPrisma.size.deleteMany({ where: { storeId } });
  await testPrisma.color.deleteMany({ where: { storeId } });
  await testPrisma.design.deleteMany({ where: { storeId } });
  await testPrisma.type.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
}

const counters = (id: string) => testPrisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedUnits: true, acqPrice: true } });

/** Un pedido de cápsulas pagado con sus finanzas, como lo dejará P4: el costo provisional ya va dentro de `totalProductCost`. */
async function paidCapsuleOrder(f: Fixture, packSize: number, options: { giftMaxCost?: number; giftMaxItems?: number; provisionalCost?: number; totalProductCost?: number } = {}) {
  const total = 64500;
  const provisionalCost = options.provisionalCost ?? 20000;
  const totalProductCost = options.totalProductCost ?? provisionalCost;
  const order = await testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `CAP-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      subtotal: total,
      total,
      totalProductCost,
      gatewayFee: 3366,
      shippingCost: 0,
      netProfit: total - totalProductCost - 3366,
      profitMarginPct: ((total - totalProductCost - 3366) / total) * 100,
      payment: { create: { method: PaymentMethod.Bold, storeId: f.store.id } },
    },
  });
  await testPrisma.capsuleOrder.create({
    data: { storeId: f.store.id, orderId: order.id, editionId: f.edition.id, packSize, giftMaxCost: options.giftMaxCost ?? 0, giftMaxItems: options.giftMaxItems ?? 0, provisionalCost },
  });
  return order;
}

const print = (f: Fixture, items: { productId: string; quantity: number }[], kind: CapsuleSlipKind = CapsuleSlipKind.SLIP, editionId = f.edition.id) =>
  printCapsuleSlips({ storeId: f.store.id, editionId, kind, items, userId: "paula" });

describe("papeles de cápsulas contra MySQL", () => {
  let f: Fixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  beforeEach(() => mail.send.mockReset());
  afterEach(async () => {
    if (f) await deleteFixture(f);
    f = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("imprimir aparta en el producto real: la tienda, el punto de venta y Mercado Libre ven menos, y la edición sube su stock", async () => {
    f = await createFixture();
    const printed = await print(f, [{ productId: f.borrador.id, quantity: 8 }, { productId: f.resaltador.id, quantity: 2 }]);
    expect(printed.printed).toBe(10);
    expect(new Set(printed.codes).size).toBe(10);

    const borrador = await counters(f.borrador.id);
    expect(borrador).toMatchObject({ stock: 10, reservedUnits: 8 });
    expect(availableStock(borrador)).toBe(2);
    expect(marketplaceAvailableStock(borrador, 1)).toBe(1);
    // La edición vende 10 cápsulas y su costo es la media de los papeles: (8 × 3.500 + 2 × 5.000) / 10.
    await expect(counters(f.editionProduct.id)).resolves.toMatchObject({ stock: 10, reservedUnits: 0, acqPrice: 3800 });
    await expect(testPrisma.capsuleBatch.findFirstOrThrow({ where: { storeId: f.store.id } })).resolves.toMatchObject({ mode: CapsuleBatchMode.RESERVE, editionId: f.edition.id, quantity: 10 });
    await expect(testPrisma.inventoryMovement.findMany({ where: { storeId: f.store.id } })).resolves.toEqual([
      expect.objectContaining({ productId: f.editionProduct.id, type: InventoryMovementType.CAPSULE_SLIPS_PRINTED, quantity: 10 }),
    ]);

    // El punto de venta no puede vender lo apartado.
    await expect(
      createPointOfSaleSale({ storeId: f.store.id, items: [{ productId: f.borrador.id, quantity: 3 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: randomUUID(), userId: f.store.userId }),
    ).rejects.toThrow(/No alcanzó el inventario/);
  });

  it("imprimir un producto publicado en Mercado Libre encola la sincronización de su stock con lo que queda disponible", async () => {
    f = await createFixture();
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `s-${randomUUID().slice(0, 8)}` },
    });
    const listing = await testPrisma.marketplaceListing.create({
      data: { connectionId: connection.id, productId: f.borrador.id, externalItemId: `MCO-${randomUUID().slice(0, 8)}`, status: "ACTIVE", stockSafetyBuffer: 1 },
    });

    await print(f, [{ productId: f.borrador.id, quantity: 8 }]);

    const events = await testPrisma.marketplaceOutboxEvent.findMany({ where: { listingId: listing.id }, select: { action: true, payload: true } });
    // 10 en stock − 8 apartados − 1 de colchón = 1 en Mercado Libre.
    expect(events).toEqual([{ action: MarketplaceOutboxAction.SYNC_STOCK, payload: { targetQuantity: 1 } }]);
  });

  it("imprimir más de lo disponible, fuera de la banda o un regalo caro falla sin apartar nada", async () => {
    f = await createFixture();
    await expect(print(f, [{ productId: f.borrador.id, quantity: 4 }, { productId: f.resaltador.id, quantity: 7 }])).rejects.toThrow(/Resaltador/);
    await expect(print(f, [{ productId: f.caro.id, quantity: 1 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(print(f, [{ productId: f.caro.id, quantity: 1 }], CapsuleSlipKind.GIFT)).rejects.toMatchObject({ statusCode: 400 });
    await expect(print(f, [{ productId: f.otherProduct.id, quantity: 1 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ reservedUnits: 0 });
    await expect(testPrisma.capsuleSlip.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
    await expect(testPrisma.capsuleBatch.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
  });

  it("el tope de un regalo sale de los packs de la edición, no del código", async () => {
    f = await createFixture();
    // 3.500 pasa la banda de papeles pero no el regalo más caro que lleva algún pack (3.000).
    await expect(print(f, [{ productId: f.borrador.id, quantity: 1 }], CapsuleSlipKind.GIFT)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("cuesta más de lo que puede costar un regalo") });
    await expect(print(f, [{ productId: f.regalo.id, quantity: 1 }], CapsuleSlipKind.GIFT, f.otherEdition.id)).rejects.toMatchObject({
      statusCode: 400,
      message: "Configura el regalo de los packs de la edición antes de imprimir regalos",
    });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ reservedUnits: 0 });
    await expect(counters(f.regalo.id)).resolves.toMatchObject({ reservedUnits: 0 });
  });

  it("los regalos se apartan en su bolsa sin subir el stock de la edición", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.regalo.id, quantity: 3 }], CapsuleSlipKind.GIFT);
    await expect(counters(f.regalo.id)).resolves.toMatchObject({ stock: 5, reservedUnits: 3 });
    await expect(counters(f.editionProduct.id)).resolves.toMatchObject({ stock: 0 });
  });

  it("sacar un papel libera 1, baja 1 de stock, congela el costo; dos veces, de otra edición o de más falla", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.borrador.id, quantity: 3 }]);
    const [first, second] = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id }, orderBy: { code: "asc" } });
    const order = await paidCapsuleOrder(f, 1);

    // Se cambia el costo del producto después de imprimir: el papel guarda el de la impresión.
    await testPrisma.product.update({ where: { id: f.borrador.id }, data: { acqPrice: 4200 } });
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: first.code.toLowerCase(), userId: "paula" })).resolves.toMatchObject({ drawnSlips: 1 });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ stock: 9, reservedUnits: 2 });
    await expect(testPrisma.inventoryMovement.findFirstOrThrow({ where: { productId: f.borrador.id, type: InventoryMovementType.CAPSULE_SLIP_DRAWN } })).resolves.toMatchObject({ quantity: -1, cost: 3500, referenceId: order.id });
    await expect(testPrisma.capsuleSlip.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({ status: CapsuleSlipStatus.DRAWN, orderId: order.id, unitCost: 3500 });

    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: first.code, userId: "paula" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: second.code, userId: "paula" })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("ya tiene sus 1 papeles") });

    await print(f, [{ productId: f.resaltador.id, quantity: 1 }], CapsuleSlipKind.SLIP, f.otherEdition.id);
    const foreign = await testPrisma.capsuleSlip.findFirstOrThrow({ where: { editionId: f.otherEdition.id } });
    const another = await paidCapsuleOrder(f, 5);
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: another.id, code: foreign.code, userId: "paula" })).rejects.toMatchObject({ statusCode: 400, message: "Ese papel es de otra edición" });
  });

  it("un regalo respeta el tope de costo y de piezas del pack", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.regalo.id, quantity: 3 }], CapsuleSlipKind.GIFT);
    const gifts = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id } });
    const order = await paidCapsuleOrder(f, 30, { giftMaxCost: 3000, giftMaxItems: 2 });
    await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: gifts[0].code, userId: "paula" });
    // 1.800 + 1.800 = 3.600 > 3.000.
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: gifts[1].code, userId: "paula" })).rejects.toMatchObject({ message: "Ese regalo pasa el tope de costo del pack" });
    const noGift = await paidCapsuleOrder(f, 5);
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: noGift.id, code: gifts[1].code, userId: "paula" })).rejects.toMatchObject({ message: "Este pack no lleva más regalos" });
  });

  it("anular libera el apartado y baja la edición; no deja anular papeles que ya se vendieron", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.borrador.id, quantity: 4 }]);
    // Se venden 3 cápsulas: la edición queda con 1 sin vender.
    await testPrisma.product.update({ where: { id: f.editionProduct.id }, data: { stock: 1 } });
    await expect(voidCapsuleSlips({ storeId: f.store.id, editionId: f.edition.id, userId: "paula" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ reservedUnits: 4 });

    const [one] = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id }, take: 1 });
    await expect(voidCapsuleSlips({ storeId: f.store.id, editionId: f.edition.id, slipIds: [one.id], userId: "paula" })).resolves.toEqual({ voided: 1 });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ stock: 10, reservedUnits: 3 });
    await expect(counters(f.editionProduct.id)).resolves.toMatchObject({ stock: 0 });
  });

  it("la revisión diaria de descuadres calla con papeles impresos y sigue avisando un descuadre real", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.borrador.id, quantity: 5 }]);
    await print(f, [{ productId: f.regalo.id, quantity: 2 }], CapsuleSlipKind.GIFT);
    await expect(checkReservationDrift()).resolves.toBe(0);
    expect(mail.send).not.toHaveBeenCalled();

    await testPrisma.product.update({ where: { id: f.borrador.id }, data: { reservedUnits: 6 } });
    await expect(checkReservationDrift()).resolves.toBe(1);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("el contador dice 6, las reservas y los papeles de cápsulas suman 5") }));
  });

  it("cerrar el sorteo reemplaza el costo provisional por el real y mueve las finanzas en la diferencia, una sola vez", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.borrador.id, quantity: 1 }, { productId: f.resaltador.id, quantity: 1 }]);
    await print(f, [{ productId: f.regalo.id, quantity: 1 }], CapsuleSlipKind.GIFT);
    const slips = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id } });
    // Provisional: media 4.250 × 2 + tope 2.000 = 10.500. Real: 3.500 + 5.000 + 1.800 = 10.300.
    const order = await paidCapsuleOrder(f, 2, { giftMaxCost: 2000, giftMaxItems: 1, provisionalCost: 10500 });
    for (const slip of slips) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });

    await expect(finishCapsuleDraw({ storeId: f.store.id, orderId: order.id })).resolves.toEqual({ provisionalCost: 10500, realCost: 10300, delta: -200 });
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.totalProductCost).toBe(10300);
    expect(after.netProfit).toBe(64500 - 10300 - 3366);
    await expect(testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ costStatus: CapsuleCostStatus.REAL, realCost: 10300 });
    await expect(finishCapsuleDraw({ storeId: f.store.id, orderId: order.id })).rejects.toMatchObject({ statusCode: 409 });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ totalProductCost: 10300 });
  });

  it("no cierra con papeles pendientes ni si las finanzas no traen el costo provisional", async () => {
    f = await createFixture();
    await print(f, [{ productId: f.borrador.id, quantity: 2 }]);
    const [slip] = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id } });
    const short = await paidCapsuleOrder(f, 2);
    await drawCapsuleSlip({ storeId: f.store.id, orderId: short.id, code: slip.code, userId: "paula" });
    await expect(finishCapsuleDraw({ storeId: f.store.id, orderId: short.id })).rejects.toMatchObject({ message: "Faltan papeles: van 1 de 2" });

    const broken = await paidCapsuleOrder(f, 1, { provisionalCost: 4000, totalProductCost: 0 });
    const [other] = await testPrisma.capsuleSlip.findMany({ where: { storeId: f.store.id, status: CapsuleSlipStatus.PRINTED } });
    await drawCapsuleSlip({ storeId: f.store.id, orderId: broken.id, code: other.code, userId: "paula" });
    await expect(finishCapsuleDraw({ storeId: f.store.id, orderId: broken.id })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("una impresión no se deshace como un empaque de cápsulas", async () => {
    f = await createFixture();
    const { batchId } = await print(f, [{ productId: f.borrador.id, quantity: 2 }]);
    await expect(unpackCapsuleBatch({ storeId: f.store.id, batchId, userId: "paula" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(counters(f.borrador.id)).resolves.toMatchObject({ stock: 10, reservedUnits: 2 });
  });
});
