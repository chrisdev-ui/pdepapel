import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Favoritos guardados como familia contra MySQL: la columna existe, el PUT
 * guarda la intención por producto y la baja cuando la misma variante se
 * guarda a propósito, y `groups=` devuelve la familia con nombre del grupo,
 * rango de precio, opciones y stock sumado aunque la variante guardada ya no
 * sea la que le pone cara.
 */
const session = vi.hoisted(() => ({ userId: "cliente-familias" }));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []], incr: async () => 1, expire: async () => 1 };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
    incr = client.incr;
    expire = client.expire;
  }
  return { Redis };
});

import { GET as getProducts } from "@/app/api/[storeId]/products/route";
import { GET as getWishlist, PUT as putWishlist } from "@/app/api/[storeId]/account/wishlist/route";
import { loadProductFamilies } from "@/lib/product-families";

const suffix = Date.now().toString(36);
let storeId = "";
let groupId = "";
let naranjaId = "";
let azulId = "";
let categoryId = "";

beforeAll(async () => {
  const store = await testPrisma.store.create({ data: { name: `Familias ${suffix}`, userId: `owner-${suffix}` } });
  storeId = store.id;
  const type = await testPrisma.type.create({ data: { name: "Kits", slug: `kits-${suffix}`, storeId } });
  const category = await testPrisma.category.create({ data: { name: "Kits de apuntes", slug: `kits-apuntes-${suffix}`, storeId, typeId: type.id } });
  categoryId = category.id;
  const size = await testPrisma.size.create({ data: { name: "Único", value: `u-${suffix}`, storeId } });
  const color = await testPrisma.color.create({ data: { name: "Girly", value: `girly-${suffix}`, storeId } });
  const design = await testPrisma.design.create({ data: { name: "Girly", storeId } });
  const group = await testPrisma.productGroup.create({ data: { storeId, name: "Kits Básicos de apuntes", slug: `kits-basicos-${suffix}`, description: "" } });
  groupId = group.id;
  const attrs = { storeId, categoryId, productGroupId: groupId, sizeId: size.id, colorId: color.id, designId: design.id, description: "" };
  const naranja = await testPrisma.product.create({
    data: { ...attrs, name: "Kit Básico Girly Naranja", slug: `kit-naranja-${suffix}`, sku: `KN-${suffix}`, price: 18000, stock: 0 },
  });
  const azul = await testPrisma.product.create({
    data: { ...attrs, name: "Kit Básico Girly Azul", slug: `kit-azul-${suffix}`, sku: `KA-${suffix}`, price: 24000, stock: 5 },
  });
  naranjaId = naranja.id;
  azulId = azul.id;
});

afterAll(async () => {
  await testPrisma.customerWishlistItem.deleteMany({ where: { storeId } });
  await testPrisma.product.deleteMany({ where: { storeId } });
  await testPrisma.productGroup.deleteMany({ where: { storeId } });
  await testPrisma.category.deleteMany({ where: { storeId } });
  await testPrisma.type.deleteMany({ where: { storeId } });
  await testPrisma.size.deleteMany({ where: { storeId } });
  await testPrisma.color.deleteMany({ where: { storeId } });
  await testPrisma.design.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
});

describe("favoritos guardados como familia (MySQL)", () => {
  it("la columna savedAsGroup existe con valor por defecto false", async () => {
    const columns = await testPrisma.$queryRawUnsafe<{ COLUMN_NAME: string; COLUMN_DEFAULT: string | null }[]>(
      "SELECT COLUMN_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CustomerWishlistItem' AND COLUMN_NAME = 'savedAsGroup'",
    );
    expect(columns).toHaveLength(1);
    expect(String(columns[0].COLUMN_DEFAULT)).toMatch(/^(0|false|b'0')$/);
  });

  it("guarda la intención de familia y la devuelve; el cuerpo antiguo sigue valiendo", async () => {
    const base = `https://admin.example.com/api/${storeId}/account/wishlist`;
    const put = await putWishlist(
      new Request(base, { method: "PUT", body: JSON.stringify({ items: [{ productId: naranjaId, savedAsGroup: true }], mode: "replace" }) }),
      { params: { storeId } },
    );
    expect(put.status).toBe(200);
    const listed = await (await getWishlist(new Request(base), { params: { storeId } })).json();
    expect(listed.items).toEqual([expect.objectContaining({ productId: naranjaId, savedAsGroup: true })]);
    expect(listed.productIds).toEqual([naranjaId]);

    // La misma variante guardada a propósito (cuerpo antiguo): la fila queda y el flag baja.
    const legacy = await putWishlist(
      new Request(base, { method: "PUT", body: JSON.stringify({ productIds: [naranjaId], mode: "replace" }) }),
      { params: { storeId } },
    );
    expect(legacy.status).toBe(200);
    const row = await testPrisma.customerWishlistItem.findFirst({ where: { storeId, userId: session.userId, productId: naranjaId } });
    expect(row?.savedAsGroup).toBe(false);
    expect(await testPrisma.customerWishlistItem.count({ where: { storeId, userId: session.userId } })).toBe(1);
  });

  it("groups= devuelve la familia aunque la variante guardada ya no le ponga cara", async () => {
    const response = await getProducts(new Request(`https://admin.example.com/api/${storeId}/products?groups=${groupId},no-existe`), { params: { storeId } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const families = await response.json();
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({
      id: azulId, // la primera con stock, no la naranja agotada
      productGroupId: groupId,
      name: "Kits Básicos de apuntes",
      isGroup: true,
      variantCount: 2,
      minPrice: 18000,
      maxPrice: 24000,
      price: 18000,
      stock: 5,
      sku: "GROUP",
    });
    expect(await loadProductFamilies(storeId, [])).toEqual([]);
  });
});
