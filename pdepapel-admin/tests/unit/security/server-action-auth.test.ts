import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cada carga de servidor del panel exige sesión y propiedad de la tienda.
 *
 * Antes de esta prueba, 33 módulos de servidor leían pedidos, productos,
 * proveedores, conversaciones y cupones sin comprobar nada: bastaba con
 * tener una sesión de Clerk (la tienda y el panel comparten instancia, así
 * que cualquier clienta tiene una) para invocar una acción de servidor con
 * el id de la tienda. Una prueba por función: sin sesión, con sesión ajena
 * y con la dueña.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const OWNER = "user_owner";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: null }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => new Map() }));
vi.mock("@/lib/dane-api", () => ({
  getAllLocationsWithCache: async () => [],
  formatLocationForDisplay: () => "",
}));
vi.mock("@/lib/cloudinary", () => ({ default: { uploader: { destroy: vi.fn() } } }));
/**
 * `lib/discount-engine.ts` crea su cliente de Upstash al importarse
 * (`Redis.fromEnv()`), y `getOrder` y `getProducts` acaban pasando por
 * `getActiveOffers`. Sin las variables `UPSTASH_REDIS_REST_*` el cliente sale
 * a la red igual y reintenta hasta pasarse de los 5 s de la prueba: en CI
 * estas dos pruebas caían por tiempo de espera, no por el guardia que se está
 * comprobando aquí. Se sustituye por el mismo doble que usa
 * `read-access-routes.test.ts`.
 */
vi.mock("@upstash/redis", () => ({
  Redis: class {
    static fromEnv() { return new this(); }
    async get() { return null; }
    async set() { return "OK"; }
    async del() { return 0; }
    async keys() { return []; }
    async scan() { return [0, []]; }
    async ttl() { return -1; }
  },
}));

/** Prisma de mentira: la propiedad de la tienda es real, lo demás devuelve vacío. */
const storeFindFirst = vi.fn(async (query: any) => {
  const where = query?.where ?? {};
  const ownerMatches = where.userId === OWNER && (where.id === undefined || where.id === STORE);
  return ownerMatches ? { id: STORE, userId: OWNER } : null;
});
const storeCount = vi.fn(async (query: any) => (query?.where?.userId === OWNER ? 1 : 0));

const emptyFor = (method: string) => {
  if (method.startsWith("findMany") || method === "groupBy" || method === "$queryRaw" || method === "$queryRawUnsafe") return [];
  if (method === "count") return 0;
  if (method === "aggregate") return { _sum: {}, _count: {}, _avg: {}, _max: {}, _min: {} };
  return null;
};

const modelProxy = (model: string) =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, method: string) => {
      if (model === "store" && method === "findFirst") return storeFindFirst;
      if (model === "store" && method === "count") return storeCount;
      return vi.fn(async () => emptyFor(method));
    },
  });

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      if (prop === "$transaction") return async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)((globalThis as any).__prismaMock) : []);
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [];
      if (prop === "$connect" || prop === "$disconnect") return async () => undefined;
      if (prop === "then") return undefined;
      return modelProxy(prop);
    },
  }),
}));

interface GuardedCase {
  name: string;
  guard: "owner" | "admin";
  load: () => Promise<Record<string, unknown>>;
  args: unknown[];
}

const CASES: GuardedCase[] = [
  { name: "createProductFromManualItem", guard: "owner", load: () => import("@/actions/create-product-from-manual-item"), args: [{ storeId: "store-1", name: "X", price: 1, cost: 1, categoryId: "c", stock: 1 }] },
  { name: "getCustomerAnalytics", guard: "owner", load: () => import("@/actions/get-customer-analytics"), args: ["store-1"] },
  { name: "getDaneLocations", guard: "admin", load: () => import("@/actions/get-dane-locations"), args: [] },
  { name: "getTopSellingProducts", guard: "owner", load: () => import("@/actions/get-top-selling-products"), args: ["store-1", 2026] },
  { name: "getBox", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/cajas/[boxId]/server/get-box"), args: ["id-1", "store-1"] },
  { name: "getBoxes", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/cajas/server/get-boxes"), args: ["store-1"] },
  { name: "getCategoryTypes", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/categorias/[categoryId]/server/get-category-types"), args: ["store-1", "id-1"] },
  { name: "getCategories", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/categorias/server/get-categories"), args: ["store-1"] },
  { name: "getColor", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/colores/[colorId]/server/get-color"), args: ["store-1", "id-1"] },
  { name: "getColors", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/colores/server/get-colors"), args: ["store-1"] },
  { name: "getBotReplies", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/conversaciones/respuestas/server/get-bot-replies"), args: ["store-1"] },
  { name: "getBotReply", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/conversaciones/respuestas/server/get-bot-replies"), args: ["store-1", "id-1"] },
  { name: "getConversations", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/conversaciones/server/get-conversations"), args: ["store-1"] },
  { name: "getCoupon", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/cupones/[couponId]/server/get-coupon"), args: ["id-1", "store-1"] },
  { name: "getCoupons", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/cupones/server/get-coupons"), args: ["store-1"] },
  { name: "getDesign", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/disenos/[designId]/server/get-design"), args: ["store-1", "id-1"] },
  { name: "getDesigns", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/disenos/server/get-designs"), args: ["store-1"] },
  { name: "getBoxes", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-boxes"), args: ["store-1"] },
  { name: "getCoupons", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-coupons"), args: ["store-1"] },
  { name: "getOrder", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-order"), args: ["id-1", "store-1"] },
  { name: "getOrders", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/pedidos/server/get-orders"), args: ["store-1"] },
  { name: "getHomeContent", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/portada/server/get-home-contents"), args: ["store-1", "id-1"] },
  { name: "getHomeContents", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/portada/server/get-home-contents"), args: ["store-1"] },
  { name: "getProduct", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product"), args: ["id-1", "store-1"] },
  { name: "getProductSeed", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product"), args: ["store-1", "id-1"] },
  { name: "getProductNamingCandidates", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/productos/nombres/server/get-product-naming-candidates"), args: ["store-1"] },
  { name: "getProducts", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/productos/server/get-products"), args: ["store-1"] },
  { name: "getSupplier", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/proveedores/[supplierId]/server/get-supplier"), args: ["store-1", "id-1"] },
  { name: "getSuppliers", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/proveedores/server/get-suppliers"), args: ["store-1"] },
  { name: "getPost", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/publicaciones/[postId]/server/get-post"), args: ["store-1", "id-1"] },
  { name: "getPosts", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/publicaciones/server/get-posts"), args: ["store-1"] },
  { name: "getShippingAnalytics", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/rendimiento/server/get-shipping-analytics"), args: ["store-1", { year: 2026, month: 9, monthIndex: 8, referenceDate: new Date(2026, 8, 15), isCurrent: true }] },
  { name: "getReviews", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/resenas/server/get-reviews"), args: ["store-1"] },
  { name: "getSize", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/tamanos/[sizeId]/server/get-size"), args: ["store-1", "id-1"] },
  { name: "getSizes", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/tamanos/server/get-sizes"), args: ["store-1"] },
  { name: "getType", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/tipos/[typeId]/server/get-type"), args: ["store-1", "id-1"] },
  { name: "getTypes", guard: "owner", load: () => import("@/app/(dashboard)/[storeId]/(routes)/tipos/server/get-types"), args: ["store-1"] },
];

/** Un fallo de autorización es un AppError 401/403; cualquier otro error significa que el guardia dejó pasar. */
async function callResult(entry: GuardedCase) {
  const moduleExports = await entry.load();
  const fn = moduleExports[entry.name] as (...args: unknown[]) => Promise<unknown>;
  expect(typeof fn).toBe("function");
  try {
    await fn(...entry.args);
    return { blocked: false, statusCode: null as number | null };
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? null;
    return { blocked: statusCode === 401 || statusCode === 403, statusCode };
  }
}

beforeEach(() => {
  storeFindFirst.mockClear();
  storeCount.mockClear();
});
afterEach(() => {
  session.userId = null;
});

describe.each(CASES)("$name", (entry) => {
  it("rechaza sin sesión", async () => {
    session.userId = null;
    const result = await callResult(entry);
    expect(result.blocked).toBe(true);
    expect(result.statusCode).toBe(401);
  });

  it("rechaza a una sesión que no es la dueña de la tienda", async () => {
    session.userId = "user_intruder";
    const result = await callResult(entry);
    expect(result.blocked).toBe(true);
    expect(result.statusCode).toBe(403);
  });

  it("deja pasar a la dueña", async () => {
    session.userId = OWNER;
    const result = await callResult(entry);
    expect(result.blocked).toBe(false);
    if (entry.guard === "owner") {
      expect(storeFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "store-1", userId: OWNER }) }));
    } else {
      expect(storeCount).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER } }));
    }
  });
});
