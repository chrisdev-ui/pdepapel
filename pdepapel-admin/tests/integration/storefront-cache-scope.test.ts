import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveProductStorefrontScope } from "@/lib/storefront-cache-scope";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El alcance de la purga contra relaciones reales (sin claves foráneas en la
 * base): pieza ↔ kit, alias de slug, grupo, categoría y tipo, líneas de pedido.
 */
describe("alcance de la purga de la tienda (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { productGroupId: null } });
      await testPrisma.productGroup.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("vender la pieza purga su ficha, la del kit que la contiene, su categoría, su tipo y sus alias", async () => {
    fixture = await createInventoryFixture();
    const { store, component, kit, category } = fixture;
    await testPrisma.productSlugAlias.create({ data: { storeId: store.id, productId: component.id, slug: `nombre-viejo-${randomUUID().slice(0, 6)}` } });
    const alias = await testPrisma.productSlugAlias.findFirstOrThrow({ where: { productId: component.id } });
    const type = await testPrisma.type.findUniqueOrThrow({ where: { id: category.typeId } });

    const scope = await resolveProductStorefrontScope(testPrisma, store.id, { productIds: [component.id] });

    expect(scope.tags).toEqual(
      expect.arrayContaining([
        `product:${component.slug}`,
        `product:${kit.slug}`,
        `product:${alias.slug}`,
        `products:category:${category.id}`,
        `products:category:${category.slug}`,
        `products:type:${type.id}`,
        `products:type:${type.slug}`,
        "products:list",
      ]),
    );
    expect(scope.tags).not.toContain("products:featured");
    expect(scope.paths).toEqual(expect.arrayContaining([`/producto/${component.slug}`, `/producto/${kit.slug}`, `/categoria/${category.slug}`, "/tienda", "/"]));
  });

  it("un pedido purga lo de sus líneas; un grupo, todas sus variantes; otra tienda, nada", async () => {
    fixture = await createInventoryFixture();
    const { store, component, kit } = fixture;
    const group = await testPrisma.productGroup.create({ data: { storeId: store.id, name: "Grupo prueba", description: "", slug: `grupo-${randomUUID().slice(0, 6)}` } });
    await testPrisma.product.update({ where: { id: component.id }, data: { productGroupId: group.id, isFeatured: true } });
    const order = await testPrisma.order.create({
      data: {
        storeId: store.id,
        orderNumber: `ORD-SC-${randomUUID().slice(0, 8)}`,
        fullName: "Luisa",
        phone: "+573009999999",
        subtotal: 1000,
        total: 1000,
        orderItems: { create: [{ productId: component.id, quantity: 1, name: "pieza", price: 1000 }] },
      },
    });

    const byOrder = await resolveProductStorefrontScope(testPrisma, store.id, { orderIds: [order.id] });
    expect(byOrder.tags).toEqual(expect.arrayContaining([`product:${component.slug}`, `products:group:${group.id}`, "products:featured", `product:${kit.slug}`]));

    const byGroup = await resolveProductStorefrontScope(testPrisma, store.id, { productGroupIds: [group.id] });
    expect(byGroup.tags).toEqual(expect.arrayContaining([`product:${component.slug}`, `products:group:${group.id}`]));

    const otherStore = await resolveProductStorefrontScope(testPrisma, `otra-${randomUUID()}`, { productIds: [component.id] });
    expect(otherStore.tags.filter((tag) => tag.startsWith("product:"))).toEqual([]);
  });
});
