import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Pedido desde el carrito del catálogo de WhatsApp (`lib/whatsapp/cart-orders.ts`):
 * cada renglón cobra el menor entre lo que mostró Meta y lo que cobra la
 * tienda hoy con ofertas y escalera (`priceLines`), y las diferencias o los
 * SKU perdidos quedan en las notas internas. Base local, datos sintéticos.
 */
const DAY = 24 * 60 * 60 * 1000;

let fixture: InventoryFixture;
let attributes: { colorId: string; sizeId: string; designId: string };

async function product(name: string, price: number) {
  return testPrisma.product.create({
    data: {
      storeId: fixture.store.id,
      categoryId: fixture.category.id,
      ...attributes,
      name,
      description: "Sintético",
      slug: `prueba-${randomUUID().slice(0, 8)}`,
      price,
      stock: 50,
      sku: `CRT-${randomUUID().slice(0, 6).toUpperCase()}`,
    } as never,
  });
}

async function cartOrder(items: { sku: string; quantity: number; unitPrice?: number | null; currency?: string | null }[]) {
  const conversation = await testPrisma.conversation.create({
    data: { storeId: fixture.store.id, phone: `57302${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, status: "OPEN", lastInboundAt: new Date() },
  });
  await testPrisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      sentBy: "CUSTOMER",
      body: null,
      externalId: `wamid.in-${randomUUID()}`,
      metadata: { order: { catalogId: "catalogo-prueba", note: "", items: items.map((item) => ({ currency: "COP", unitPrice: null, ...item })) } } as never,
    },
  });
  const { createOrderFromConversationCart } = await import("@/lib/whatsapp/cart-orders");
  const result = await createOrderFromConversationCart({ storeId: fixture.store.id, conversationId: conversation.id, createdBy: fixture.store.userId });
  return testPrisma.order.findUniqueOrThrow({
    where: { id: result.orderId },
    select: { subtotal: true, total: true, internalNotes: true, status: true, orderItems: { select: { sku: true, quantity: true, price: true } } },
  });
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  attributes = (await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } })) as never;
});

afterAll(async () => {
  const store = fixture.store.id;
  const orders = (await testPrisma.order.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.orderItem.deleteMany({ where: { orderId: { in: orders } } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversation: { storeId: store } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.order.deleteMany({ where: { storeId: store } });
  const offers = (await testPrisma.offer.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.offerProduct.deleteMany({ where: { offerId: { in: offers } } });
  await testPrisma.offer.deleteMany({ where: { storeId: store } });
  await testPrisma.productPriceTier.deleteMany({ where: { storeId: store } });
  await testPrisma.product.deleteMany({ where: { storeId: store, description: "Sintético" } });
  await deleteInventoryFixture(fixture);
});

describe("pedido desde el carrito del catálogo de WhatsApp", () => {
  it("producto con oferta vigente: cobra el precio rebajado aunque Meta mostrara el de lista", async () => {
    const tote = await product("Tote Carrito Oferta", 35000);
    await testPrisma.offer.create({
      data: { storeId: fixture.store.id, name: "Oferta carrito", type: "PERCENTAGE", amount: 20, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), products: { create: [{ productId: tote.id }] } } as never,
    });
    const order = await cartOrder([{ sku: tote.sku!, quantity: 2, unitPrice: 35000 }]);
    expect(order.status).toBe("DRAFT");
    expect(order.orderItems).toEqual([{ sku: tote.sku, quantity: 2, price: 28000 }]);
    expect(order.subtotal).toBe(56000);
    expect(order.internalNotes).toContain("Tote Carrito Oferta");
    expect(order.internalNotes).toContain("se cobra");
  });

  it("escalera por cantidad: a esa cantidad cobra el peldaño", async () => {
    const marcador = await product("Marcador Carrito Escalera", 6000);
    await testPrisma.productPriceTier.create({ data: { storeId: fixture.store.id, productId: marcador.id, minQuantity: 10, unitPrice: 5000 } as never });
    const order = await cartOrder([{ sku: marcador.sku!, quantity: 12, unitPrice: 6000 }]);
    expect(order.orderItems[0].price).toBe(5000);
    expect(order.subtotal).toBe(60000);
  });

  it("Meta mostró menos que la tienda: cobra lo de Meta y lo anota", async () => {
    const libreta = await product("Libreta Carrito Meta Menor", 20000);
    const order = await cartOrder([{ sku: libreta.sku!, quantity: 1, unitPrice: 18000 }]);
    expect(order.orderItems[0].price).toBe(18000);
    expect(order.internalNotes).toMatch(/Meta .*18\.000.*tienda .*20\.000/);
  });

  it("Meta mostró más que la tienda: cobra lo de la tienda y lo anota", async () => {
    const cuaderno = await product("Cuaderno Carrito Meta Mayor", 12000);
    const order = await cartOrder([{ sku: cuaderno.sku!, quantity: 3, unitPrice: 15000 }]);
    expect(order.orderItems[0].price).toBe(12000);
    expect(order.subtotal).toBe(36000);
    expect(order.internalNotes).toMatch(/Meta .*15\.000.*tienda .*12\.000/);
  });

  it("SKU que no existe: el resto entra al pedido y Paula lo ve en las notas", async () => {
    const lapiz = await product("Lápiz Carrito Existe", 2500);
    const order = await cartOrder([
      { sku: lapiz.sku!, quantity: 2, unitPrice: 2500 },
      { sku: "NO-EXISTE-<b>9", quantity: 1, unitPrice: 9000 },
    ]);
    expect(order.orderItems).toEqual([{ sku: lapiz.sku, quantity: 2, price: 2500 }]);
    expect(order.internalNotes).toContain("no se encontraron en el catálogo");
    expect(order.internalNotes).toContain("NO-EXISTE-&lt;b&gt;9 × 1");
    expect(order.internalNotes).not.toContain("<b>9");
  });

  it("sin oferta y mismo precio que Meta: igual que antes, sin notas", async () => {
    const regla = await product("Regla Carrito Normal", 3000);
    const order = await cartOrder([{ sku: regla.sku!, quantity: 4, unitPrice: 3000 }]);
    expect(order.orderItems[0].price).toBe(3000);
    expect(order.subtotal).toBe(12000);
    expect(order.internalNotes).toBeNull();
  });
});
