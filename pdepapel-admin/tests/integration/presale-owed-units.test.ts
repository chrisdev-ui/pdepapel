import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType, PaymentMethod, ProductPresaleStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { allocateFairInventory } from "@/lib/fair-events";
import { validateStockAvailability } from "@/lib/inventory";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { owedPresaleUnits } from "@/lib/presale-owed";
import { createReservation } from "@/lib/stock-reservations";
import { priceCartProducts } from "@/lib/whatsapp/cart-orders";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La mercancía de una preventa llegó (stock 6) pero Paula todavía no pulsó
 * «Liberar»: 4 unidades ya están cobradas. Solo 2 se pueden vender por
 * cualquier otro camino.
 */
describe("lo cobrado en una preventa abierta no se vende dos veces", () => {
  let fixture: InventoryFixture | undefined;
  let presaleId = "";

  const f = () => fixture!;

  const orderWithPreorderLine = async (status: OrderStatus, quantity: number, extra: { unfulfilled?: boolean } = {}) =>
    testPrisma.order.create({
      data: {
        storeId: f().store.id,
        orderNumber: `ORD-OWE-${randomUUID().slice(0, 8)}`,
        status,
        type: OrderType.STANDARD,
        fullName: "Clienta de la preventa",
        phone: "+573001112233",
        address: "Calle 1",
        total: 30000 * quantity,
        subtotal: 30000 * quantity,
        orderItems: {
          create: [
            {
              productId: f().component.id,
              quantity,
              price: 10000,
              isPreorder: true,
              presaleId,
              preorderUnfulfilledAt: extra.unfulfilled ? new Date() : null,
            },
          ],
        },
      },
    });

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await testPrisma.productPresale.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const setup = async () => {
    fixture = await createInventoryFixture();
    const presale = await testPrisma.productPresale.create({
      data: {
        storeId: f().store.id,
        productId: f().component.id,
        expectedArrivalAt: new Date(Date.now() + 86400000),
        unitLimit: 20,
        committedUnits: 4,
        createdBy: f().store.userId,
      },
    });
    presaleId = presale.id;
    await orderWithPreorderLine(OrderStatus.DEPOSIT_PAID, 3);
    await orderWithPreorderLine(OrderStatus.PAID, 1);
  };

  it("cuenta solo lo cobrado y sin entregar de una preventa activa", async () => {
    await setup();
    // Un carrito sin pagar y una línea «sin unidad» no son deuda.
    await orderWithPreorderLine(OrderStatus.PENDING, 5);
    await orderWithPreorderLine(OrderStatus.DEPOSIT_PAID, 2, { unfulfilled: true });

    const owed = await owedPresaleUnits(testPrisma, [f().component.id, f().kit.id]);
    expect(owed.get(f().component.id)).toBe(4);
    expect(owed.has(f().kit.id)).toBe(false);

    await testPrisma.productPresale.update({ where: { id: presaleId }, data: { status: ProductPresaleStatus.RELEASED } });
    expect((await owedPresaleUnits(testPrisma, [f().component.id])).size).toBe(0);
  });

  it("pedido del panel o carrito de WhatsApp al confirmarse: pasa con 2, se frena con 3 (también dentro de un kit)", async () => {
    await setup();
    await expect(validateStockAvailability(testPrisma, [{ productId: f().component.id, quantity: 2 }])).resolves.toBeUndefined();
    await expect(validateStockAvailability(testPrisma, [{ productId: f().component.id, quantity: 3 }])).rejects.toMatchObject({
      details: { items: [expect.objectContaining({ productId: f().component.id, available: 2, requested: 3 })] },
    });
    // Cada kit lleva 2 piezas: 1 kit cabe, 2 no.
    await expect(validateStockAvailability(testPrisma, [{ productId: f().kit.id, quantity: 1 }])).resolves.toBeUndefined();
    await expect(validateStockAvailability(testPrisma, [{ productId: f().kit.id, quantity: 2 }])).rejects.toBeTruthy();
  });

  it("el carrito de WhatsApp muestra 2 disponibles", async () => {
    await setup();
    const product = await testPrisma.product.findUniqueOrThrow({
      where: { id: f().component.id },
      select: { id: true, name: true, sku: true, price: true, stock: true, reservedUnits: true, isArchived: true, categoryId: true, productGroupId: true },
    });
    const [priced] = await priceCartProducts(f().store.id, [{ sku: product.sku, quantity: 1 }], [{ ...product, price: Number(product.price) }]);
    expect(priced.stock).toBe(2);
  });

  it("punto de venta: 3 se rechaza y dice que el resto es de la preventa; 2 se vende", async () => {
    await setup();
    const sell = (quantity: number) =>
      createPointOfSaleSale({
        storeId: f().store.id,
        items: [{ productId: f().component.id, quantity }],
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: `pos-owed-${randomUUID()}`,
        userId: f().store.userId,
      });
    await expect(sell(3)).rejects.toThrow(/2 para vender, pediste 3; 4 son de clientas de la preventa/);
    await expect(sell(2)).resolves.toMatchObject({ duplicate: false });
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: f().component.id } });
    expect(product.stock).toBe(4);
  });

  it("feria: no se lleva lo que se debe a la preventa", async () => {
    await setup();
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: f().store.id, name: "Feria con preventa", createdBy: f().store.userId },
    });
    await expect(
      allocateFairInventory({
        storeId: f().store.id,
        fairEventId: fairEvent.id,
        allocations: [{ productId: f().component.id, quantity: 3 }],
        userId: f().store.userId,
      }),
    ).rejects.toBeTruthy();
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: f().component.id } })).stock).toBe(6);

    await allocateFairInventory({
      storeId: f().store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: f().component.id, quantity: 2 }],
      userId: f().store.userId,
    });
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: f().component.id } })).stock).toBe(4);
  });

  it("apartado: no se aparta lo que se debe a la preventa", async () => {
    await setup();
    const reserve = (quantity: number) =>
      createReservation({
        storeId: f().store.id,
        items: [{ productId: f().component.id, quantity }],
        customerName: "Otra clienta",
        customerPhone: "+573001112233",
        createdBy: f().store.userId,
      });
    await expect(reserve(3)).rejects.toMatchObject({ statusCode: 409 });
    await reserve(2);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: f().component.id } })).reservedUnits).toBe(2);
  });
});
