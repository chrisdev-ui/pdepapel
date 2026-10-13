import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trigger: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: mocks.trigger }));
vi.mock("@/lib/mercadolibre/outbox", () => ({ enqueuePendingMarketplaceOutboxEventsForStore: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn() } }));

import { revalidateStorefrontFor } from "@/lib/cache";
import * as scopeModule from "@/lib/storefront-cache-scope";
import { fitsScopedPurge, mergeScopes, resolveProductStorefrontScope } from "@/lib/storefront-cache-scope";

type Row = Record<string, unknown>;

/** Base falsa con las cuatro tablas que lee el resolvedor. */
function fakeDb({ products = [] as Row[], kits = [] as { kitId: string; componentId: string }[], aliases = [] as Row[], items = [] as Row[] } = {}) {
  const inList = (value: unknown, list?: { in: string[] }) => !list || list.in.includes(value as string);
  return {
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) =>
        products.filter((p) => inList(p.id, where.id) && inList(p.productGroupId, where.productGroupId) && p.storeId === where.storeId),
      ),
    },
    productKit: {
      findMany: vi.fn(async ({ where }: { where: Record<string, any> }) =>
        kits.filter((link) =>
          where.OR
            ? where.OR.some((c: Record<string, { in: string[] }>) => (c.kitId ? c.kitId.in.includes(link.kitId) : c.componentId.in.includes(link.componentId)))
            : where.componentId.in.includes(link.componentId),
        ),
      ),
    },
    productSlugAlias: { findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => aliases.filter((a) => where.productId.in.includes(a.productId))) },
    orderItem: { findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => items.filter((i) => where.orderId.in.includes(i.orderId))) },
  };
}

const product = (id: string, extra: Row = {}) => ({
  id,
  storeId: "s",
  slug: `slug-${id}`,
  isFeatured: false,
  productGroupId: null,
  categoryId: `cat-${id}`,
  category: { slug: `categoria-${id}`, typeId: "type-1", type: { slug: "escritura" } },
  ...extra,
});

describe("resolveProductStorefrontScope", () => {
  it("covers the product page by slug, id and old aliases, its group, category and type lists, and the general list", async () => {
    const db = fakeDb({ products: [product("p1", { productGroupId: "g1" })], aliases: [{ productId: "p1", slug: "nombre-viejo" }] });
    const scope = await resolveProductStorefrontScope(db as never, "s", { productIds: ["p1"] });

    expect(scope.tags.sort()).toEqual(
      [
        "products:list",
        "product:p1",
        "product:slug-p1",
        "product:nombre-viejo",
        "products:group:g1",
        "products:category:cat-p1",
        "products:category:categoria-p1",
        "products:type:type-1",
        "products:type:escritura",
      ].sort(),
    );
    expect(scope.paths.sort()).toEqual(["/", "/categoria/categoria-p1", "/producto/slug-p1", "/tienda"].sort());
  });

  it("purges the header's featured list only when a touched product is featured", async () => {
    const plain = await resolveProductStorefrontScope(fakeDb({ products: [product("p1")] }) as never, "s", { productIds: ["p1"] });
    const featured = await resolveProductStorefrontScope(fakeDb({ products: [product("p1", { isFeatured: true })] }) as never, "s", { productIds: ["p1"] });
    expect(plain.tags).not.toContain("products:featured");
    expect(featured.tags).toContain("products:featured");
  });

  it("selling a piece refreshes the kits that contain it, and selling a kit refreshes its pieces and their other kits", async () => {
    const products = ["kit-a", "kit-b", "pieza"].map((id) => product(id));
    const kits = [
      { kitId: "kit-a", componentId: "pieza" },
      { kitId: "kit-b", componentId: "pieza" },
    ];
    const fromPiece = await resolveProductStorefrontScope(fakeDb({ products, kits }) as never, "s", { productIds: ["pieza"] });
    expect(fromPiece.tags).toEqual(expect.arrayContaining(["product:kit-a", "product:kit-b", "product:pieza"]));

    const fromKit = await resolveProductStorefrontScope(fakeDb({ products, kits }) as never, "s", { productIds: ["kit-a"] });
    expect(fromKit.tags).toEqual(expect.arrayContaining(["product:pieza", "product:kit-b"]));
  });

  it("resolves an order to the products on its lines, skipping manual items", async () => {
    const db = fakeDb({ products: [product("p1"), product("p2")], items: [{ orderId: "o1", productId: "p1" }, { orderId: "o1", productId: null }, { orderId: "o2", productId: "p2" }] });
    const scope = await resolveProductStorefrontScope(db as never, "s", { orderIds: ["o1"] });
    expect(scope.tags).toContain("product:p1");
    expect(scope.tags).not.toContain("product:p2");
  });

  it("expands a group to its variants, and still purges the group list when it has none left", async () => {
    const db = fakeDb({ products: [product("v1", { productGroupId: "g1" }), product("v2", { productGroupId: "g1" })] });
    const scope = await resolveProductStorefrontScope(db as never, "s", { productGroupIds: ["g1"] });
    expect(scope.tags).toEqual(expect.arrayContaining(["product:v1", "product:v2", "products:group:g1"]));

    const empty = await resolveProductStorefrontScope(fakeDb() as never, "s", { productGroupIds: ["g9"] });
    expect(empty.tags).toEqual(["products:list", "products:group:g9"]);
  });

  it("returns nothing when nothing was touched, so the caller falls back to the full purge", async () => {
    expect(await resolveProductStorefrontScope(fakeDb() as never, "s", { productIds: [] })).toEqual({ tags: [], paths: [] });
  });

  it("merges scopes without repeats and refuses scopes over the store's caps", () => {
    expect(mergeScopes({ tags: ["a", "b"], paths: ["/x"] }, null, { tags: ["b"], paths: ["/x", "/y"] })).toEqual({ tags: ["a", "b"], paths: ["/x", "/y"] });
    expect(fitsScopedPurge({ tags: Array.from({ length: 201 }, (_, i) => `t${i}`), paths: [] })).toBe(false);
    expect(fitsScopedPurge({ tags: ["t"], paths: Array.from({ length: 51 }, (_, i) => `/p${i}`) })).toBe(false);
  });
});

describe("revalidateStorefrontFor (fails open: over-purge, never stale)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.trigger.mockClear();
  });

  it("sends the resolved scope merged with the previous one", async () => {
    vi.spyOn(scopeModule, "resolveProductStorefrontScope").mockResolvedValue({ tags: ["product:new"], paths: ["/producto/new"] });
    await revalidateStorefrontFor("s", { productIds: ["p1"], previous: { tags: ["products:category:old"], paths: ["/categoria/old"] } });
    expect(mocks.trigger).toHaveBeenCalledWith({
      scope: { tags: ["product:new", "products:category:old"], paths: ["/producto/new", "/categoria/old"] },
    });
  });

  it("purges everything without a target", async () => {
    await revalidateStorefrontFor("s");
    expect(mocks.trigger).toHaveBeenCalledWith();
  });

  it("purges everything when the scope cannot be resolved", async () => {
    vi.spyOn(scopeModule, "resolveProductStorefrontScope").mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await revalidateStorefrontFor("s", "p1");
    expect(mocks.trigger).toHaveBeenCalledWith();
  });

  it("purges everything when the scope resolves to nothing or is too big", async () => {
    vi.spyOn(scopeModule, "resolveProductStorefrontScope").mockResolvedValueOnce({ tags: [], paths: [] });
    await revalidateStorefrontFor("s", { productIds: ["gone"] });
    vi.spyOn(scopeModule, "resolveProductStorefrontScope").mockResolvedValueOnce({ tags: Array.from({ length: 201 }, (_, i) => `product:p${i}`), paths: [] });
    await revalidateStorefrontFor("s", { productIds: ["many"] });
    expect(mocks.trigger.mock.calls).toEqual([[], []]);
  });
});
