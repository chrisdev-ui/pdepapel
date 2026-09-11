import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType, PaymentMethod, Prisma, ShippingProvider, ShippingStatus, Social } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Guardas de esquema de la auditoría Grupo A: una caja con envíos no se borra
 * ni siquiera desde el cliente de Prisma (Restrict emulado, sin llaves
 * foráneas en MySQL), y una publicación de red social no se repite en la
 * misma tienda (índice único real).
 */
describe("schema guards: boxes and social posts", () => {
  let fixture: InventoryFixture;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  beforeEach(async () => {
    fixture = await createInventoryFixture();
  });

  afterEach(async () => {
    await testPrisma.shipping.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.post.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.box.deleteMany({ where: { storeId: fixture.store.id } });
    await deleteInventoryFixture(fixture);
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("refuses to delete a box that a shipment references and keeps the shipment's box", async () => {
    const box = await testPrisma.box.create({
      data: { storeId: fixture.store.id, name: `Caja ${randomUUID()}`, type: "S", width: 20, height: 10, length: 21 },
    });
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        fullName: "Cliente Prueba",
        phone: "+573001234567",
        email: "cliente@prueba.test",
        address: "Calle 1 # 2-3",
        city: "Medellín",
        department: "Antioquia",
        subtotal: 10000,
        total: 10000,
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: fixture.store.id } },
        shipping: {
          create: { storeId: fixture.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, cost: 8000, carrierName: "TCC", boxId: box.id },
        },
      },
    });

    await expect(testPrisma.box.delete({ where: { id: box.id } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const shipping = await testPrisma.shipping.findUniqueOrThrow({ where: { orderId: order.id }, select: { boxId: true } });
    expect(shipping.boxId).toBe(box.id);
    expect(await testPrisma.box.count({ where: { id: box.id } })).toBe(1);
  });

  it("rejects the same social post twice in a store but allows it in another store", async () => {
    const other = await testPrisma.store.create({ data: { name: `Otra ${randomUUID()}`, userId: `other-${randomUUID()}` } });
    try {
      await testPrisma.post.create({ data: { storeId: fixture.store.id, social: Social.Instagram, postId: "DApEIvNx_og" } });
      await expect(
        testPrisma.post.create({ data: { storeId: fixture.store.id, social: Social.Instagram, postId: "DApEIvNx_og" } }),
      ).rejects.toMatchObject({ code: "P2002" });
      await expect(
        testPrisma.post.create({ data: { storeId: other.id, social: Social.Instagram, postId: "DApEIvNx_og" } }),
      ).resolves.toMatchObject({ postId: "DApEIvNx_og" });
    } finally {
      await testPrisma.post.deleteMany({ where: { storeId: other.id } });
      await testPrisma.store.delete({ where: { id: other.id } });
    }
  });
});
