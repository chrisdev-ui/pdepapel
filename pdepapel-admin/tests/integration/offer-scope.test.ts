import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchScopeProducts, summarizeScope } from "@/lib/offer-scope";

import { testPrisma } from "./helpers/database";

/**
 * El selector de alcance busca de a pocos y avisa de las ofertas que ya
 * alcanzan a un producto, directo o por su subcategoría.
 */
describe("offer scope search and summary", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId = "";
  let categoryId = "";
  let otherCategoryId = "";
  let agenda = "";
  let cuaderno = "";
  let agotado = "";
  let offerId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
    const store = await testPrisma.store.create({ data: { name: `Ofertas ${suffix}`, userId: `owner-${suffix}` } });
    storeId = store.id;
    const type = await testPrisma.type.create({ data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId } });
    const category = await testPrisma.category.create({ data: { name: "Agendas", slug: `agendas-${suffix}`, storeId, typeId: type.id } });
    const other = await testPrisma.category.create({ data: { name: "Cuadernos", slug: `cuadernos-${suffix}`, storeId, typeId: type.id } });
    categoryId = category.id;
    otherCategoryId = other.id;
    const size = await testPrisma.size.create({ data: { name: "Único", value: "U", storeId } });
    const color = await testPrisma.color.create({ data: { name: "Lila", value: "#b9afee", storeId } });
    const design = await testPrisma.design.create({ data: { name: "Kawaii", storeId } });
    const product = (name: string, price: number, stock: number, cat: string, sold: number) =>
      testPrisma.product.create({
        data: { name, slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${suffix}`, description: "", stock, price, acqPrice: price / 2, sku: `${name.slice(0, 3).toUpperCase()}-${suffix}-${sold}`, soldCount: sold, storeId, categoryId: cat, sizeId: size.id, colorId: color.id, designId: design.id },
      });
    agenda = (await product("Agenda A5", 23000, 3, categoryId, 10)).id;
    cuaderno = (await product("Cuaderno argollado", 8000, 5, otherCategoryId, 50)).id;
    agotado = (await product("Agenda mini", 15000, 0, categoryId, 1)).id;
    const offer = await testPrisma.offer.create({
      data: {
        storeId,
        name: "Agendas -10",
        type: "PERCENTAGE",
        amount: 10,
        isActive: true,
        startDate: new Date(Date.now() - 86_400_000),
        endDate: new Date(Date.now() + 30 * 86_400_000),
        categories: { create: [{ category: { connect: { id: categoryId } } }] },
      },
    });
    offerId = offer.id;
  });

  afterAll(async () => {
    await testPrisma.offer.deleteMany({ where: { storeId } });
    await testPrisma.product.deleteMany({ where: { storeId } });
    await testPrisma.category.deleteMany({ where: { storeId } });
    await testPrisma.type.deleteMany({ where: { storeId } });
    await testPrisma.size.deleteMany({ where: { storeId } });
    await testPrisma.color.deleteMany({ where: { storeId } });
    await testPrisma.design.deleteMany({ where: { storeId } });
    await testPrisma.store.delete({ where: { id: storeId } });
    await testPrisma.$disconnect();
  });

  it("searches by name or subcategory, hides sold-out products by default and flags the category offer", async () => {
    const all = await searchScopeProducts(testPrisma, storeId, { query: "" });
    expect(all.products.map((row) => row.name)).toEqual(["Cuaderno argollado", "Agenda A5"]);
    expect(all.hasMore).toBe(false);
    const byCategory = await searchScopeProducts(testPrisma, storeId, { query: "agendas", includeOutOfStock: true });
    expect(byCategory.products.map((row) => row.name).sort()).toEqual(["Agenda A5", "Agenda mini"]);
    const agendaRow = byCategory.products.find((row) => row.id === agenda);
    expect(agendaRow?.overlaps).toEqual([{ offerId, name: "Agendas -10", type: "PERCENTAGE", amount: 10, after: 20700 }]);
    const excluded = await searchScopeProducts(testPrisma, storeId, { query: "agenda a5", excludeOfferId: offerId });
    expect(excluded.products[0]?.overlaps).toEqual([]);
    const limited = await searchScopeProducts(testPrisma, storeId, { query: "", limit: 1 });
    expect(limited.products).toHaveLength(1);
    expect(limited.hasMore).toBe(true);
  });

  it("summarizes the scope with overlaps, free products and the sellable count", async () => {
    const summary = await summarizeScope(testPrisma, storeId, { productIds: [cuaderno], categoryIds: [categoryId], productGroupIds: [], type: "FIXED", amount: 9000 });
    expect(summary.affected).toBe(3);
    expect(summary.sellable).toBe(2);
    expect(summary.byProducts).toBe(1);
    expect(summary.byCategories).toBe(2);
    expect(summary.overlaps.count).toBe(2);
    expect(summary.free).toEqual({ count: 1, names: ["Cuaderno argollado"] });
    expect(summary.sample?.name).toBe("Cuaderno argollado");
    expect(await summarizeScope(testPrisma, storeId, { productIds: [], categoryIds: [], productGroupIds: [] })).toMatchObject({ affected: 0, sample: null });
    expect(agotado).toBeTruthy();
  });
});
