import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Plural y género en el buscador de la tienda, contra MySQL de verdad.
 *
 * La tienda no tiene buscador propio: la barra de búsqueda llama a
 * `/search/products` y el listado de /tienda a `/products?fromShop=true`, y
 * las dos rutas arman el `where` con `lib/search-terms.ts`. Antes «cuadernos»
 * no encontraba «Cuaderno Kuromi» (la frase se buscaba tal cual dentro del
 * nombre) y «rosada» no encontraba nada que dijera «Rosa».
 *
 * Se prueban las dos rutas como las llama la tienda, con lo que ya funcionaba
 * (nombre exacto, sinónimos) y con lo nuevo (plural, -z/-ces, género).
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@upstash/redis", () => {
  const client = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    scan: async () => [0, []],
  };
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

import { GET as productsGET } from "@/app/api/[storeId]/products/route";
import { GET as searchGET } from "@/app/api/[storeId]/search/products/route";

const suffix = randomUUID().slice(0, 8);
let storeId = "";

const request = (url: string) =>
  new NextRequest(url, { headers: { Origin: "https://papeleriapdepapel.com" } });

/** La barra de búsqueda: `/search/products?search=…`. */
async function barra(search: string): Promise<string[]> {
  const response = await searchGET(
    request(`http://admin.test/api/x/search/products?search=${encodeURIComponent(search)}`),
    { params: { storeId } },
  );
  expect(response.status).toBe(200);
  const rows = (await response.json()) as { name: string }[];
  return rows.map((r) => r.name).sort();
}

/**
 * El listado de /tienda con el término escrito en la URL. La tienda manda
 * siempre `groupBy=parents`; sin él, este mismo `search` lo usan los
 * selectores del panel (paleta de comandos, selector de productos), que
 * mandan `availability=all`.
 */
async function listado(search: string, extra = "&groupBy=parents"): Promise<string[]> {
  const response = await productsGET(
    request(
      `http://admin.test/api/x/products?fromShop=true&search=${encodeURIComponent(search)}&page=1&itemsPerPage=24${extra}`,
    ),
    { params: { storeId } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { products: { name: string }[] };
  return body.products.map((p) => p.name).sort();
}

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: { name: `Tienda plural ${suffix}`, userId: `test-user-plural-${suffix}` },
  });
  storeId = store.id;
  const type = await testPrisma.type.create({
    data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId },
  });
  const category = await testPrisma.category.create({
    data: { name: "Cuadernos", slug: `cuadernos-${suffix}`, storeId, typeId: type.id },
  });
  const size = await testPrisma.size.create({
    data: { name: "M", value: `m-${suffix}`, storeId },
  });
  const color = await testPrisma.color.create({
    data: { name: "Multicolor", value: `multi-${suffix}`, storeId },
  });
  const design = await testPrisma.design.create({ data: { name: "Clásico", storeId } });

  let n = 0;
  const producto = (name: string) => {
    n += 1;
    return testPrisma.product.create({
      data: {
        name,
        slug: `plural-${suffix}-${n}`,
        description: "<p>Producto de pruebas.</p>",
        stock: 3,
        price: 12000,
        acqPrice: 4000,
        sku: `PL-${suffix}-${n}`,
        storeId,
        categoryId: category.id,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });
  };

  await producto("Cuaderno Kuromi");
  await producto("Cuadernos Stitch x3");
  await producto("Lápices de colores x12");
  await producto("Lápiz Hello Kitty");
  await producto("Cartuchera Wisdom Rosa");
  await producto("Borrador Morado");
  await producto("Sobre plástico oficio");
  await producto("Tote bag Caribe");
});

afterAll(async () => {
  if (storeId) {
    await testPrisma.product.deleteMany({ where: { storeId } });
    await testPrisma.design.deleteMany({ where: { storeId } });
    await testPrisma.color.deleteMany({ where: { storeId } });
    await testPrisma.size.deleteMany({ where: { storeId } });
    await testPrisma.category.deleteMany({ where: { storeId } });
    await testPrisma.type.deleteMany({ where: { storeId } });
    await testPrisma.store.delete({ where: { id: storeId } });
  }
  await testPrisma.$disconnect();
});

describe("la barra de búsqueda de la tienda (/search/products)", () => {
  it("lo que ya funcionaba: nombre exacto y sinónimos", async () => {
    expect(await barra("kuromi")).toEqual(["Cuaderno Kuromi"]);
    expect(await barra("libreta")).toEqual(["Cuaderno Kuromi", "Cuadernos Stitch x3"]);
    expect(await barra("estuche")).toEqual(["Cartuchera Wisdom Rosa"]);
  });

  it("plural regular: «cuadernos» encuentra «Cuaderno Kuromi»", async () => {
    expect(await barra("cuadernos")).toEqual(["Cuaderno Kuromi", "Cuadernos Stitch x3"]);
    expect(await barra("cuadernos kuromi")).toEqual(["Cuaderno Kuromi"]);
  });

  it("-z / -ces: «lápiz» y «lápices» encuentran los dos productos", async () => {
    const esperado = ["Lápices de colores x12", "Lápiz Hello Kitty"];
    expect(await barra("lápiz")).toEqual(esperado);
    expect(await barra("lápices")).toEqual(esperado);
    expect(await barra("lapices")).toEqual(esperado);
  });

  it("-es ambiguo: «sobres» encuentra «Sobre plástico»", async () => {
    expect(await barra("sobres")).toEqual(["Sobre plástico oficio"]);
  });

  it("género: «rosada» y «rosadas» encuentran lo que dice «Rosa»", async () => {
    expect(await barra("rosada")).toEqual(["Cartuchera Wisdom Rosa"]);
    expect(await barra("rosadas")).toEqual(["Cartuchera Wisdom Rosa"]);
    // La frase sigue siendo contigua («cartuchera rosada» no está dentro de
    // «Cartuchera Wisdom Rosa»); lo que cambia es el género de la palabra.
    expect(await barra("wisdom rosada")).toEqual(["Cartuchera Wisdom Rosa"]);
    expect(await barra("morada")).toEqual(["Borrador Morado"]);
  });

  it("tote / bolso / bolsa, en singular y en plural", async () => {
    for (const q of ["bolso", "bolsos", "bolsa", "totes"]) {
      expect(await barra(q), q).toEqual(["Tote bag Caribe"]);
    }
  });

  it("lo que no existe sigue sin existir", async () => {
    expect(await barra("dinosaurio")).toEqual([]);
  });
});

describe("el listado de /tienda con ?search= (/products?fromShop=true)", () => {
  it("lo que ya funcionaba: nombre exacto y sinónimos", async () => {
    expect(await listado("kuromi")).toEqual(["Cuaderno Kuromi"]);
    expect(await listado("libreta")).toEqual(["Cuaderno Kuromi", "Cuadernos Stitch x3"]);
  });

  it("plural, -ces y género también aquí", async () => {
    expect(await listado("cuadernos")).toEqual(["Cuaderno Kuromi", "Cuadernos Stitch x3"]);
    expect(await listado("lápices")).toEqual(["Lápices de colores x12", "Lápiz Hello Kitty"]);
    expect(await listado("rosada")).toEqual(["Cartuchera Wisdom Rosa"]);
    expect(await listado("sobres")).toEqual(["Sobre plástico oficio"]);
  });

  it("los selectores del panel (sin agrupar, availability=all) también", async () => {
    const panel = "&availability=all";
    expect(await listado("kuromi", panel)).toEqual(["Cuaderno Kuromi"]);
    expect(await listado("cuadernos", panel)).toEqual(["Cuaderno Kuromi", "Cuadernos Stitch x3"]);
    expect(await listado("lápices", panel)).toEqual(["Lápices de colores x12", "Lápiz Hello Kitty"]);
    expect(await listado("rosada", panel)).toEqual(["Cartuchera Wisdom Rosa"]);
  });
});
