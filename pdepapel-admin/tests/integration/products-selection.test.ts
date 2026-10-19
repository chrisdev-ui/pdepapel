import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NO_BRAND_FILTER_VALUE, listProductPage, parseProductListQuery } from "@/lib/product-list";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Seleccionar los N de este filtro» contra MySQL: la selección viaja como la
 * consulta de la lista, el servidor la vuelve a correr (los mismos productos
 * que listan las páginas), exige el número confirmado y decide él qué filas se
 * omiten; nada se toca si la lista cambió entre confirmar y aplicar.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/discount-engine", () => ({ getActiveOffers: async () => [] }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const json = (body: unknown) => new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let fixture: InventoryFixture | undefined;
let groupId = "";
let brandId = "";
let ids: string[] = [];
const options = { offers: [], threshold: 3 };

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  session.userId = fixture.store.userId;
  const store = fixture.store.id;
  const suffix = randomUUID().slice(0, 8);
  groupId = (await testPrisma.productGroup.create({ data: { storeId: store, name: `Hadas ${suffix}`, description: "" } as never })).id;
  brandId = (await testPrisma.brand.create({ data: { storeId: store, name: `Norma ${suffix}`, slug: `norma-${suffix}`, aliases: [] } as never })).id;
  // 40 «Lapicero» a la venta: 30 sin marca (10 con GTIN real), 2 en un grupo cuya tercera variante
  // no dice «Lapicero», 8 con otra marca; más ruido que no coincide.
  const rows = Array.from({ length: 46 }, (_, i) => ({
    storeId: store,
    categoryId: fixture!.category.id,
    sizeId: fixture!.component.sizeId,
    colorId: fixture!.component.colorId,
    designId: fixture!.component.designId,
    name: i < 40 ? `Lapicero ${i}` : i === 40 ? "Libreta hadas" : `Ruido ${i}`,
    slug: `sel-${suffix}-${i}`,
    sku: `SEL-${suffix}-${i}`,
    description: "Producto de pruebas",
    price: 2000,
    stock: 5,
    gtin: i < 10 ? `770000000${String(i).padStart(4, "0")}` : null,
    hasNoProductIdentifier: false,
    brandId: i >= 32 && i < 40 ? brandId : null,
    productGroupId: i === 30 || i === 31 || i === 40 ? groupId : null,
    createdAt: new Date(Date.now() - i * 60_000),
  }));
  await testPrisma.product.createMany({ data: rows as never });
  ids = (await testPrisma.product.findMany({ where: { storeId: store, sku: { startsWith: `SEL-${suffix}` } }, select: { id: true } })).map((row) => row.id);
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.product.deleteMany({ where: { id: { in: ids } } });
    await testPrisma.productGroup.deleteMany({ where: { id: groupId } });
    await testPrisma.brand.deleteMany({ where: { id: brandId } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const QUERY = `q=lapicero&marca=${NO_BRAND_FILTER_VALUE}&orden=name&pagina=2`;

describe("Seleccionar los N de este filtro (MySQL)", () => {
  it("el servidor vuelve a correr la consulta: los mismos productos que listan todas las páginas, sin importar la página", async () => {
    const { resolveMatchingProductIds } = await import("@/lib/product-selection");
    const store = fixture!.store.id;
    const resolved = await resolveMatchingProductIds(store, { query: QUERY });
    const first = await listProductPage(testPrisma, store, parseProductListQuery({ q: "lapicero", marca: NO_BRAND_FILTER_VALUE, orden: "name" }), options);
    const second = await listProductPage(testPrisma, store, parseProductListQuery({ q: "lapicero", marca: NO_BRAND_FILTER_VALUE, orden: "name", pagina: "2" }), options);
    expect(resolved).toEqual([...first.ids, ...second.ids]);
    expect(resolved).toHaveLength(32);
  });

  it("si el número confirmado ya no es el de la lista, responde 409 con el número nuevo y no toca nada", async () => {
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const response = await POST(json({ match: { query: QUERY, expectedCount: 31 }, field: "isFeatured", value: true }), { params: { storeId: fixture!.store.id } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ details: { code: "SELECTION_CHANGED", count: 32 } });
    await expect(testPrisma.product.count({ where: { id: { in: ids }, isFeatured: true } })).resolves.toBe(0);
    const missing = await POST(json({ match: { query: QUERY }, field: "isFeatured", value: true }), { params: { storeId: fixture!.store.id } });
    expect(missing.status).toBe(400);
  });

  it("«Marcar sin código» en todo el filtro omite en el servidor los que tienen GTIN y los conserva", async () => {
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const store = fixture!.store.id;
    const preview = await POST(json({ match: { query: QUERY }, field: "hasNoProductIdentifier", value: true, preview: true }), { params: { storeId: store } });
    expect(await preview.json()).toMatchObject({ selection: { matching: 32, eligible: 22, skipped: [{ reason: "Tiene GTIN; se conserva", count: 10 }] } });
    const applied = await POST(json({ match: { query: QUERY, expectedCount: 32 }, field: "hasNoProductIdentifier", value: true }), { params: { storeId: store } });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ updated: 22 });
    await expect(testPrisma.product.count({ where: { id: { in: ids }, gtin: { not: null } } })).resolves.toBe(10);
    await expect(testPrisma.product.count({ where: { id: { in: ids }, hasNoProductIdentifier: true } })).resolves.toBe(22);
  });

  it("las variantes hermanas del grupo salen de las filas que coinciden, no del navegador", async () => {
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const store = fixture!.store.id;
    const preview = await POST(json({ match: { query: QUERY }, field: "isFeatured", value: true, preview: true }), { params: { storeId: store } });
    expect(await preview.json()).toMatchObject({ siblings: { total: 1, archived: 0 }, selection: { matching: 32, eligible: 32 } });
    const applied = await POST(json({ match: { query: QUERY, expectedCount: 32 }, field: "isFeatured", value: true, expandGroups: true }), { params: { storeId: store } });
    expect(await applied.json()).toMatchObject({ updated: 33 });
    await expect(testPrisma.product.count({ where: { name: "Libreta hadas", storeId: store, isFeatured: true } })).resolves.toBe(1);
  });

  it("«Asignar marca» a todo el filtro: cuenta, respeta los que conservan su marca y exige el número", async () => {
    const { POST } = await import("@/app/api/[storeId]/brands/assign/route");
    const store = fixture!.store.id;
    const target = await testPrisma.brand.create({ data: { storeId: store, name: `Kiut ${randomUUID().slice(0, 6)}`, slug: `kiut-${randomUUID().slice(0, 6)}`, aliases: [] } as never });
    // Toda la búsqueda «lapicero», con y sin marca: 40.
    const query = "q=lapicero&vista=todos";
    const preview = await POST(json({ brandId: target.id, match: { query }, preview: true }), { params: { storeId: store } });
    const body = await preview.json();
    expect(body).toMatchObject({ matching: 40, requested: 32 });
    expect(body.withOtherBrand).toHaveLength(8);
    const keepOne = body.withOtherBrand.slice(1).map((row: { id: string }) => row.id);
    const stale = await POST(json({ brandId: target.id, match: { query, expectedCount: 39 }, replaceIds: keepOne }), { params: { storeId: store } });
    expect(stale.status).toBe(409);
    const applied = await POST(json({ brandId: target.id, match: { query, expectedCount: 40 }, replaceIds: keepOne }), { params: { storeId: store } });
    expect(applied.status).toBe(200);
    // 39 de la búsqueda y la tercera variante del grupo, que arrastra la marca del grupo.
    await expect(testPrisma.product.count({ where: { storeId: store, brandId: target.id } })).resolves.toBe(40);
    await expect(testPrisma.product.count({ where: { storeId: store, brandId } })).resolves.toBe(1);
    await testPrisma.product.updateMany({ where: { storeId: store }, data: { brandId: null } });
    await testPrisma.productGroup.updateMany({ where: { id: groupId }, data: { brandId: null } });
    await testPrisma.brand.delete({ where: { id: target.id } });
  });

  it("el resumen de la barra dice cuántos cambian con cada acción, y el CSV trae todos", async () => {
    const { POST } = await import("@/app/api/[storeId]/products/selection/route");
    const store = fixture!.store.id;
    const summary = await (await POST(json({ query: "q=lapicero&vista=todos", intent: "summary" }), { params: { storeId: store } })).json();
    expect(summary).toMatchObject({ count: 40, actions: { archive: { eligible: 40 }, restore: { eligible: 0 } } });
    const csv = await (await POST(json({ query: "q=lapicero&vista=todos", intent: "csv", expectedCount: 40 }), { params: { storeId: store } })).json();
    expect(csv.count).toBe(40);
    expect(csv.csv.split("\n")).toHaveLength(41);
    session.userId = "user_ajeno";
    const stranger = await POST(json({ query: "q=lapicero", intent: "summary" }), { params: { storeId: store } });
    expect(stranger.status).toBe(403);
    session.userId = fixture!.store.userId;
  });

  it("el CSV de «todos los N» trae el mismo stock que el CSV de la página y la lista (el de un kit sale de sus piezas)", async () => {
    const { POST } = await import("@/app/api/[storeId]/products/selection/route");
    const { getProducts } = await import("@/app/(dashboard)/[storeId]/(routes)/productos/server/get-products");
    const { productsToCsv } = await import("@/lib/product-bulk");
    const { currencyFormatter } = await import("@/lib/utils");
    const store = fixture!.store.id;
    const query = "vista=todos";
    // Por página: lo que exporta la barra en cada página, con las filas de la lista.
    const pages: Record<string, unknown>[] = [];
    for (let page = 1; ; page += 1) {
      const result = await getProducts(store, parseProductListQuery({ vista: "todos", pagina: String(page) }));
      pages.push(...(result.products as unknown as Record<string, unknown>[]));
      if (page >= result.pageCount) break;
    }
    const perPage = stockBySku(productsToCsv(pages as never, currencyFormatter));
    const all = await (await POST(json({ query, intent: "csv", expectedCount: pages.length }), { params: { storeId: store } })).json();
    const allN = stockBySku(all.csv);
    expect(allN).toEqual(perPage);
    // El kit del fixture: 0 unidades propias, 6 de su pieza que lleva 2 → 3 kits.
    expect(allN[fixture!.kit.sku]).toBe("3");
    expect(allN[fixture!.component.sku]).toBe("6");
  });
});

/** SKU → columna Stock de un CSV de productos (respeta comillas). */
function stockBySku(csv: string): Record<string, string> {
  const [header, ...lines] = csv.split("\n").map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted && ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { cells.push(cell); cell = ""; }
      else cell += ch;
    }
    cells.push(cell);
    return cells;
  });
  const sku = header.indexOf("SKU");
  const stock = header.indexOf("Stock");
  return Object.fromEntries(lines.map((cells) => [cells[sku], cells[stock]]));
}
