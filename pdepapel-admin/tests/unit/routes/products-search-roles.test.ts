import { beforeEach, describe, expect, it, vi } from "vitest";

import { productCacheKeyPatterns } from "@/lib/product-cache-keys";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({
  role: "owner" as "owner" | "viewer",
  cache: new Map<string, unknown>(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  prices: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "u" }) }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: async () => ({ userId: "u", role: mocks.role }) }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
// Redis en memoria: lo que una cuenta guarda, la otra lo podría leer.
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (key: string) => (mocks.cache.has(key) ? JSON.parse(mocks.cache.get(key) as string) : null),
      set: async (key: string, value: string) => mocks.cache.set(key, value),
    }),
  },
}));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: mocks.prices }));

import { GET } from "@/app/api/[storeId]/products/search/route";

const call = async (params: string) => (await GET(new Request(`https://admin.test/api/store-1/products/search?${params}`), { params: { storeId: "store-1" } })).json();
const product = { id: "p1", name: "Libreta", sku: "LIB-1", gtin: null, stock: 3, reservedUnits: 0, price: 10000, acqPrice: 4000, transportationCost: 500, soldCount: 42, brand: null, brandId: null, brandRef: null, mpn: null, hasNoProductIdentifier: true, color: null, size: null, design: null, productGroupId: null, productGroup: null, isKit: false, categoryId: "c", category: { id: "c", name: "Libretas" }, images: [], kitComponents: [] };

/**
 * El selector del panel guarda sus resultados 60 s en Redis. La llave no
 * llevaba el rol: lo que buscaba la dueña (con costos) se le servía a la
 * cuenta de solo lectura, y al revés.
 */
describe("GET /products/search: la caché no mezcla roles", () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.role = "owner";
    mocks.findFirst.mockResolvedValue(product);
    mocks.findMany.mockResolvedValue([product]);
    mocks.prices.mockResolvedValue(new Map());
  });

  it("la dueña busca primero; la cuenta de solo lectura no recibe sus costos desde la caché", async () => {
    const owner = await call("q=lib");
    expect(owner.data[0].acqPrice).toBe(4000);
    mocks.role = "viewer";
    const viewer = await call("q=lib");
    assertNoForbiddenKeys(viewer, "viewer");
    expect(viewer.data[0].name).toBe("Libreta");
  });

  it("y al revés: la dueña no recibe la respuesta sin costos que guardó la cuenta de solo lectura", async () => {
    mocks.role = "viewer";
    await call("q=lib");
    mocks.role = "owner";
    expect((await call("q=lib")).data[0].acqPrice).toBe(4000);
  });

  it("Vender (`mode=venta`) no le da a la cuenta de solo lectura `soldCount` ni costos", async () => {
    mocks.role = "viewer";
    assertNoForbiddenKeys(await call("q=lib&mode=venta"), "viewer");
    mocks.role = "owner";
    expect((await call("q=lib&mode=venta")).data[0].soldCount).toBe(42);
  });

  it("el tamaño de página va en la llave, y la purga de productos cubre todas las variantes", async () => {
    await call("q=lib&limit=5");
    await call("q=lib&limit=20");
    mocks.role = "viewer";
    await call("q=lib&mode=venta");
    const keys = Array.from(mocks.cache.keys());
    expect(new Set(keys).size).toBe(3);
    const pattern = productCacheKeyPatterns("store-1").find((p) => p.includes("admin-select"))!;
    for (const key of keys) expect(key.startsWith(pattern.replace(/\*$/, ""))).toBe(true);
  });
});
