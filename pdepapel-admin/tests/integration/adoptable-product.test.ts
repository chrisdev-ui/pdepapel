import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: vi.fn().mockResolvedValue("owner") }));

import { loadAdoptableProduct } from "@/app/(dashboard)/[storeId]/(routes)/productos/nuevo-grupo/server/get-adoptable-product";

/** «Convertir en variantes» abre el editor de grupo con el producto suelto ya traído. */
const suffix = randomUUID().slice(0, 8);
let storeId = "";
let otherStoreId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  const store = await testPrisma.store.create({ data: { name: `Adoptar ${suffix}`, userId: `u-adopt-${suffix}` } });
  const other = await testPrisma.store.create({ data: { name: `Otra ${suffix}`, userId: `u-adopt-other-${suffix}` } });
  storeId = store.id;
  otherStoreId = other.id;
  const type = await testPrisma.type.create({ data: { name: "Oficina", slug: `oficina-${suffix}`, storeId } });
  const category = await testPrisma.category.create({ data: { name: "Folders", slug: `folders-${suffix}`, storeId, typeId: type.id } });
  const size = await testPrisma.size.create({ data: { name: "Único", value: `u-${suffix}`, storeId } });
  const color = await testPrisma.color.create({ data: { name: "Rosado", value: `#ff00aa`, storeId } });
  const design = await testPrisma.design.create({ data: { name: "Kawaii", storeId } });
  const base = { description: "<p>x</p>", stock: 5, price: 18000, acqPrice: 7000, storeId, categoryId: category.id, colorId: color.id, sizeId: size.id, designId: design.id };
  const group = await testPrisma.productGroup.create({ data: { name: "Grupo", slug: `grupo-${suffix}`, description: "", storeId } });
  const make = (key: string, extra: Record<string, unknown> = {}) =>
    testPrisma.product.create({
      data: {
        ...base, name: `Folder ${key}`, slug: `folder-${key}-${suffix}`, sku: `AD-${key}-${suffix}`,
        images: { create: [{ url: `https://res.cloudinary.com/test/image/upload/v1/${key}-1.jpg`, isMain: true }, { url: `https://res.cloudinary.com/test/image/upload/v1/${key}-2.jpg`, isMain: false }] },
        ...extra,
      },
    });
  ids.standalone = (await make("suelto")).id;
  ids.grouped = (await make("agrupado", { productGroupId: group.id })).id;
  ids.archived = (await make("archivado", { isArchived: true })).id;
  ids.kit = (await make("kit", { isKit: true })).id;
});

afterAll(async () => {
  for (const id of [storeId, otherStoreId]) {
    if (!id) continue;
    await testPrisma.image.deleteMany({ where: { product: { storeId: id } } });
    await testPrisma.product.deleteMany({ where: { storeId: id } });
    await testPrisma.productGroup.deleteMany({ where: { storeId: id } });
    await testPrisma.design.deleteMany({ where: { storeId: id } });
    await testPrisma.color.deleteMany({ where: { storeId: id } });
    await testPrisma.size.deleteMany({ where: { storeId: id } });
    await testPrisma.category.deleteMany({ where: { storeId: id } });
    await testPrisma.type.deleteMany({ where: { storeId: id } });
    await testPrisma.store.delete({ where: { id } });
  }
  await testPrisma.$disconnect();
});

describe("loadAdoptableProduct", () => {
  it("trae el producto suelto con sus atributos, fotos en orden y datos reales", async () => {
    const product = await loadAdoptableProduct(storeId, ids.standalone);
    expect(product).toMatchObject({
      id: ids.standalone,
      name: "Folder suelto",
      price: 18000,
      acqPrice: 7000,
      stock: 5,
      color: { name: "Rosado" },
      design: { name: "Kawaii" },
      size: { name: "Único" },
      category: { name: "Folders" },
    });
    expect(product?.images.map((image) => image.url)).toEqual([
      expect.stringContaining("suelto-1.jpg"),
      expect.stringContaining("suelto-2.jpg"),
    ]);
  });

  it("no trae un producto de otra tienda, ya agrupado, archivado o combo", async () => {
    expect(await loadAdoptableProduct(otherStoreId, ids.standalone)).toBeNull();
    expect(await loadAdoptableProduct(storeId, ids.grouped)).toBeNull();
    expect(await loadAdoptableProduct(storeId, ids.archived)).toBeNull();
    expect(await loadAdoptableProduct(storeId, ids.kit)).toBeNull();
    expect(await loadAdoptableProduct(storeId, "no-existe")).toBeNull();
  });
});
