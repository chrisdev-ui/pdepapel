import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Filtros del listado de la tienda (`/products?groupBy=parents`), auditoría
 * 2026-10-08: M3 precio efectivo, M4 conteos por tarjeta, M5 tipo
 * desconocido, B8 tipo + subcategoría y bordes de precio.
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []] };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
  }
  return { Redis };
});

import { GET as categoriesGET } from "@/app/api/[storeId]/categories/route";
import { GET as productsGET } from "@/app/api/[storeId]/products/route";

const suffix = randomUUID().slice(0, 8);
let storeId = "";
const ids: Record<string, string> = {};

type Listing = {
  products: { name: string; price: number }[];
  totalItems: number;
  facets: { colors: { id: string; count: number }[]; types?: { id: string; count: number }[]; priceRanges?: { id: string; count: number }[] };
};

async function listing(query: string): Promise<Listing> {
  const response = await productsGET(
    new NextRequest(`http://admin.test/api/x/products?fromShop=true&groupBy=parents&page=1&itemsPerPage=24&${query}`, {
      headers: { Origin: "https://papeleriapdepapel.com" },
    }),
    { params: { storeId } },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Listing;
}
const names = (body: Listing) => body.products.map((product) => product.name).sort();

beforeAll(async () => {
  const store = await testPrisma.store.create({ data: { name: `Filtros ${suffix}`, userId: `test-user-filtros-${suffix}` } });
  storeId = store.id;
  const typeA = await testPrisma.type.create({ data: { name: "Escritura", slug: `escritura-${suffix}`, storeId } });
  const typeB = await testPrisma.type.create({ data: { name: "Oficina", slug: `oficina-${suffix}`, storeId } });
  ids.typeA = typeA.id;
  ids.typeB = typeB.id;
  const a1 = await testPrisma.category.create({ data: { name: "Lápices", slug: `lapices-${suffix}`, storeId, typeId: typeA.id } });
  const a2 = await testPrisma.category.create({ data: { name: "Esferos", slug: `esferos-${suffix}`, storeId, typeId: typeA.id } });
  const b1 = await testPrisma.category.create({ data: { name: "Carpetas", slug: `carpetas-${suffix}`, storeId, typeId: typeB.id } });
  ids.a1 = a1.id;
  const empty = await testPrisma.category.create({ data: { name: "Termos", slug: `termos-${suffix}`, storeId, typeId: typeB.id } });
  ids.empty = empty.id;
  const [s, m, l] = await Promise.all(
    ["S", "M", "L"].map((name) => testPrisma.size.create({ data: { name, value: `${name}-${suffix}`, storeId } })),
  );
  const red = await testPrisma.color.create({ data: { name: "Rojo", value: `rojo-${suffix}`, storeId } });
  const blue = await testPrisma.color.create({ data: { name: "Azul", value: `azul-${suffix}`, storeId } });
  ids.red = red.id;
  const design = await testPrisma.design.create({ data: { name: "Liso", storeId } });

  let n = 0;
  const product = (name: string, categoryId: string, colorId: string, sizeId: string, price: number, productGroupId?: string) => {
    n += 1;
    return testPrisma.product.create({
      data: {
        name, slug: `filtros-${suffix}-${n}`, description: "<p>Prueba.</p>", stock: 3, price, acqPrice: 1000,
        sku: `FI-${suffix}-${n}`, storeId, categoryId, colorId, sizeId, designId: design.id, productGroupId,
      },
    });
  };

  const discounted = await product("Lápiz en oferta", a1.id, red.id, s.id, 10_000);
  await product("Esfero azul", a2.id, blue.id, s.id, 8_000);
  await product("Esfero borde", a2.id, blue.id, m.id, 10_000);
  await product("Carpeta roja", b1.id, red.id, s.id, 30_000);
  const group = await testPrisma.productGroup.create({ data: { name: "Lápiz grupo", slug: `lapiz-grupo-${suffix}`, description: "", storeId } });
  for (const size of [s, m, l]) await product(`Lápiz grupo ${size.name}`, a1.id, red.id, size.id, 6_000, group.id);

  await testPrisma.offer.create({
    data: {
      storeId, name: "Mitad", label: "-50 %", type: "PERCENTAGE", amount: 50,
      startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000),
      products: { create: [{ productId: discounted.id }] },
    },
  });
});

afterAll(async () => {
  if (storeId) {
    await testPrisma.offer.deleteMany({ where: { storeId } });
    await testPrisma.product.deleteMany({ where: { storeId } });
    await testPrisma.productGroup.deleteMany({ where: { storeId } });
    await testPrisma.design.deleteMany({ where: { storeId } });
    await testPrisma.color.deleteMany({ where: { storeId } });
    await testPrisma.size.deleteMany({ where: { storeId } });
    await testPrisma.category.deleteMany({ where: { storeId } });
    await testPrisma.type.deleteMany({ where: { storeId } });
    await testPrisma.store.delete({ where: { id: storeId } });
  }
  await testPrisma.$disconnect();
});

describe("tipo y subcategoría", () => {
  it("M5: un tipo que no existe no devuelve el catálogo entero", async () => {
    const body = await listing("typeId=no-existe");
    expect(body.totalItems).toBe(0);
    expect(body.products).toEqual([]);
  });

  it("B8: una subcategoría reduce solo su tipo; el otro tipo elegido sigue completo", async () => {
    const body = await listing(`typeId=${ids.typeA},${ids.typeB}&categoryId=${ids.a1}`);
    expect(names(body)).toEqual(["Carpeta roja", "Lápiz en oferta", "Lápiz grupo"]);
  });
});

describe("precio", () => {
  it("M3: filtra por el precio que se ve, con la oferta aplicada", async () => {
    const cheap = await listing("minPrice=4000&maxPrice=7000");
    expect(names(cheap)).toEqual(["Lápiz en oferta", "Lápiz grupo"]);
    expect(cheap.products.find((product) => product.name === "Lápiz en oferta")?.price).toBe(5_000);

    const basePrice = await listing("minPrice=9000&maxPrice=11000");
    expect(names(basePrice)).toEqual(["Esfero borde"]);
  });

  it("B8: un producto en el borde cae en un solo rango", async () => {
    expect(names(await listing("minPrice=5000&maxPrice=10000"))).toEqual(["Esfero azul", "Lápiz en oferta", "Lápiz grupo"]);
    expect(names(await listing("minPrice=10000&maxPrice=20000"))).toEqual(["Esfero borde"]);
  });
});

describe("conteos de las facetas", () => {
  it("M4: un grupo de tres variantes del mismo color cuenta una vez", async () => {
    const body = await listing("");
    expect(body.facets.colors.find((facet) => facet.id === ids.red)?.count).toBe(3);
    expect(body.facets.types?.find((facet) => facet.id === ids.typeA)?.count).toBe(4);
  });

  it("M4: el conteo de cada rango de precio coincide con lo que trae aplicarlo", async () => {
    const body = await listing("");
    for (const range of body.facets.priceRanges ?? []) {
      const [min, max] = JSON.parse(range.id) as [number, number];
      const applied = await listing(`minPrice=${min}${max < 99_999_999 ? `&maxPrice=${max}` : ""}`);
      expect({ range: range.id, count: range.count }).toEqual({ range: range.id, count: applied.totalItems });
    }
  });
});

describe("subcategorías vacías", () => {
  it("M6: la lista pública dice cuántos productos a la venta tiene cada subcategoría", async () => {
    const response = await categoriesGET(new Request("http://admin.test/api/x/categories"), { params: { storeId } });
    const categories = (await response.json()) as { id: string; productCount: number }[];
    expect(categories.find((category) => category.id === ids.empty)?.productCount).toBe(0);
    expect(categories.find((category) => category.id === ids.a1)?.productCount).toBe(4);
  });
});
