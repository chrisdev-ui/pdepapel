import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NO_BRAND_FILTER_VALUE, PRODUCT_PAGE_SIZE, listProductPage, parseProductListQuery } from "@/lib/product-list";
import { PRODUCT_VIEWS } from "@/lib/product-readiness";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Productos paginado en el servidor contra MySQL: cada pestaña cuenta lo mismo
 * que listan sus páginas (también con «Sin marca», una marca y los
 * archivados), las páginas no repiten ni pierden, la búsqueda no distingue
 * tildes y la cuenta de solo lectura no recibe costos.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/discount-engine", () => ({ getActiveOffers: async () => [] }));

const DAY = 86_400_000;
let fixture: InventoryFixture | undefined;
let brandId = "";
let groupId = "";
let supplierId = "";
let extraIds: string[] = [];

const options = { offers: [], threshold: 3 };

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const suffix = randomUUID().slice(0, 8);
  brandId = (await testPrisma.brand.create({ data: { storeId: store, name: `Kiut ${suffix}`, slug: `kiut-${suffix}`, aliases: [] } as never })).id;
  supplierId = (await testPrisma.supplier.create({ data: { storeId: store, name: `Proveedora ${suffix}` } as never })).id;
  groupId = (await testPrisma.productGroup.create({ data: { storeId: store, name: `Libreta hadas ${suffix}`, description: "" } as never })).id;

  const rows = Array.from({ length: 64 }, (_, i) => ({
    storeId: store,
    categoryId: fixture!.category.id,
    sizeId: fixture!.component.sizeId,
    colorId: fixture!.component.colorId,
    designId: fixture!.component.designId,
    name: i === 0 ? "Lápiz HB" : i === 1 ? "Cuadérno rayado" : `Producto ${i}`,
    slug: `producto-${suffix}-${i}`,
    sku: `LST-${suffix}-${i}`,
    description: "Producto de pruebas",
    price: 10_000 + i,
    acqPrice: i % 9 === 0 ? 0 : 4_000,
    transportationCost: i % 11 === 0 ? 1000 : null,
    stock: i % 8 === 0 ? 0 : i % 13 === 0 ? 2 : 20,
    isArchived: i === 0 || i % 5 === 0,
    hasNoProductIdentifier: i % 6 !== 0,
    availableAt: i % 17 === 0 ? new Date(Date.now() + 5 * DAY) : null,
    brandId: i % 4 === 0 ? brandId : null,
    productGroupId: i >= 50 && i < 56 ? groupId : null,
    supplierId: i % 3 === 0 ? supplierId : null,
    createdAt: new Date(Date.now() - i * DAY),
  }));
  await testPrisma.product.createMany({ data: rows as never });
  extraIds = (await testPrisma.product.findMany({ where: { storeId: store, sku: { startsWith: `LST-${suffix}` } }, select: { id: true } })).map((row) => row.id);
  await testPrisma.image.createMany({
    data: extraIds.slice(0, 40).map((productId, i) => ({ productId, url: `https://images.test/${i}.jpg`, isMain: true, brokenAt: i < 2 ? new Date() : null })) as never,
  });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.image.deleteMany({ where: { productId: { in: extraIds } } });
    await testPrisma.product.deleteMany({ where: { id: { in: extraIds } } });
    await testPrisma.productGroup.deleteMany({ where: { id: groupId } });
    await testPrisma.brand.deleteMany({ where: { id: brandId } });
    await testPrisma.supplier.deleteMany({ where: { id: supplierId } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

/** Recorre todas las páginas de una consulta y devuelve los ids, comprobando que no se repitan. */
async function walk(params: Record<string, string>) {
  const store = fixture!.store.id;
  const first = await listProductPage(testPrisma, store, parseProductListQuery(params), options);
  const ids = [...first.ids];
  for (let page = 2; page <= first.pageCount; page += 1) {
    ids.push(...(await listProductPage(testPrisma, store, parseProductListQuery({ ...params, pagina: String(page) }), options)).ids);
  }
  expect(new Set(ids).size, JSON.stringify(params)).toBe(ids.length);
  return { first, ids };
}

describe("Productos paginado en el servidor (MySQL)", () => {
  it("cada pestaña cuenta exactamente lo que listan sus páginas, con y sin filtro de marca", async () => {
    const store = fixture!.store.id;
    for (const marca of [undefined, NO_BRAND_FILTER_VALUE, brandId]) {
      const base: Record<string, string> = marca ? { marca } : {};
      const { counts } = await listProductPage(testPrisma, store, parseProductListQuery(base), options);
      for (const view of PRODUCT_VIEWS) {
        const { first, ids } = await walk({ ...base, vista: view.id });
        expect(first.total, `${view.id} ${marca ?? "todas"}`).toBe(counts[view.id]);
        expect(ids.length, `${view.id} ${marca ?? "todas"}`).toBe(counts[view.id]);
      }
    }
  });

  it("«Sin foto propia» lista las variantes vivas que solo muestran la portada de su grupo", async () => {
    const store = fixture!.store.id;
    const variants = await testPrisma.product.findMany({ where: { productGroupId: groupId, isArchived: false }, orderBy: { sku: "asc" }, select: { id: true } });
    const [soloPortada, conPropia, ambas] = variants.map((row) => row.id);
    const cover = "https://images.test/portada-grupo.jpg";
    await testPrisma.image.create({ data: { productGroupId: groupId, url: cover, isMain: true, scope: "GROUP_ONLY" } });
    await testPrisma.image.createMany({
      data: [
        { productId: soloPortada, url: cover, origin: "GROUP_COPY", isMain: true },
        { productId: conPropia, url: "https://images.test/propia.jpg", origin: "OWN", isMain: true },
        { productId: ambas, url: cover, origin: "OWN", isMain: true },
        { productId: ambas, url: "https://images.test/propia-2.jpg", origin: "OWN" },
      ],
    });
    try {
      const { ids, first } = await walk({ vista: "sin-foto-propia" });
      expect(ids).toEqual([soloPortada]);
      expect(first.counts["sin-foto-propia"]).toBe(1);
    } finally {
      await testPrisma.image.deleteMany({ where: { OR: [{ productGroupId: groupId }, { productId: { in: [soloPortada, conPropia, ambas] } }] } });
    }
  });

  it("los archivados y «Sin marca» suman lo que hay en la base", async () => {
    const store = fixture!.store.id;
    const archived = await testPrisma.product.count({ where: { storeId: store, isArchived: true } });
    const withoutBrand = await testPrisma.product.count({ where: { storeId: store, brandId: null } });
    expect((await walk({ vista: "archivados" })).ids).toHaveLength(archived);
    expect((await walk({ vista: "todos", marca: NO_BRAND_FILTER_VALUE })).ids).toHaveLength(withoutBrand);
    expect(archived).toBeGreaterThan(10);
  });

  it("?proveedor= lista todos los productos de la proveedora, incluidos los archivados, en cualquier pestaña", async () => {
    const store = fixture!.store.id;
    const expected = await testPrisma.product.count({ where: { storeId: store, supplierId } });
    const archived = await testPrisma.product.count({ where: { storeId: store, supplierId, isArchived: true } });
    expect(archived).toBeGreaterThan(0);
    for (const vista of ["activos", "archivados"]) {
      const { first, ids } = await walk({ proveedor: supplierId, vista });
      expect(first.total).toBe(expected);
      expect(ids).toHaveLength(expected);
    }
  });

  it("la cuenta de solo lectura no filtra por proveedora: ve la lista de siempre", async () => {
    const store = fixture!.store.id;
    const plain = await listProductPage(testPrisma, store, parseProductListQuery({}), { ...options, viewer: true });
    const withSupplier = await listProductPage(testPrisma, store, parseProductListQuery({ proveedor: supplierId }), { ...options, viewer: true });
    expect(withSupplier.total).toBe(plain.total);
    expect(withSupplier.ids).toEqual(plain.ids);
  });

  it("páginas de 25; una página de más cae en la última; sin resultados no falla", async () => {
    const { first, ids } = await walk({ vista: "todos" });
    expect(first).toMatchObject({ page: 1, pageSize: PRODUCT_PAGE_SIZE, pageCount: Math.ceil(ids.length / PRODUCT_PAGE_SIZE) });
    expect(first.ids).toHaveLength(PRODUCT_PAGE_SIZE);
    const store = fixture!.store.id;
    const last = await listProductPage(testPrisma, store, parseProductListQuery({ vista: "todos", pagina: String(first.pageCount) }), options);
    const beyond = await listProductPage(testPrisma, store, parseProductListQuery({ vista: "todos", pagina: "999" }), options);
    expect(beyond).toMatchObject({ page: first.pageCount, ids: last.ids });
    expect(await listProductPage(testPrisma, store, parseProductListQuery({ q: "zzz-no-existe" }), options)).toMatchObject({ total: 0, ids: [] });
  });

  it("la búsqueda ignora tildes y mayúsculas y mira todas las pestañas, incluidos los archivados", async () => {
    const store = fixture!.store.id;
    const search = (q: string) => listProductPage(testPrisma, store, parseProductListQuery({ q }), options);
    const archivedPencil = await search("lapiz");
    expect(archivedPencil.total).toBe(1);
    expect((await search("LÁPIZ hb")).ids).toEqual(archivedPencil.ids);
    expect((await search("cuaderno")).total).toBe(1);
    expect((await search("cuadérno RAYADO")).total).toBe(1);
  });

  it("ordena toda la lista por precio a través de las páginas", async () => {
    const { ids } = await walk({ vista: "todos", orden: "-price" });
    const prices = new Map((await testPrisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, price: true } })).map((row) => [row.id, row.price]));
    const ordered = ids.map((id) => prices.get(id)!);
    expect(ordered).toEqual([...ordered].sort((a, b) => b - a));
  });

  it("la página completa llega sin costos a la cuenta de solo lectura y con costos a la dueña", async () => {
    const { getProducts } = await import("@/app/(dashboard)/[storeId]/(routes)/productos/server/get-products");
    const store = fixture!.store.id;
    session.userId = "user_viewer_list";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [store] } };
    const asViewer = await getProducts(store, parseProductListQuery({ vista: "todos" }));
    expect(asViewer.products).toHaveLength(PRODUCT_PAGE_SIZE);
    for (const row of asViewer.products as Record<string, unknown>[]) {
      for (const hidden of ["acqPrice", "transportationCost", "supplierId"]) expect(row, hidden).not.toHaveProperty(hidden);
    }
    session.userId = fixture!.store.userId;
    session.claims = {};
    const asOwner = await getProducts(store, parseProductListQuery({ vista: "todos" }));
    expect(asOwner.products[0]).toHaveProperty("acqPrice");
    expect(asOwner.products.map((row) => row.id)).toEqual(asViewer.products.map((row) => row.id));
  });
});
