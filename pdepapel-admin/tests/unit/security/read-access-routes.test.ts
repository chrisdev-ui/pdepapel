import { describe, expect, it, vi } from "vitest";

/**
 * Fase 1 del acceso de solo lectura: estas lecturas aceptan a la dueña y a
 * una cuenta de solo lectura con la tienda permitida; el resto sigue fuera.
 * Las lecturas sensibles (costos, datos personales, proveedores, impuestos,
 * cuentas bancarias) siguen siendo solo de la dueña: eso es la fase 2.
 *
 * Lo que se comprueba es el guardia, no el contenido: una respuesta que no
 * sea 401 ni 403 significa que la petición pasó el control y falló, si acaso,
 * por una dependencia externa que aquí no existe.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));
const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STRANGER = "user_stranger";
const STORE = "store-1";

// Las rutas arrastran configuración real (env validado, Redis, Cloudinary, Mercado
// Libre). Aquí solo interesa el guardia, así que se sustituyen por cáscaras.
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
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
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { resources: async () => ({ resources: [] }), delete_resources: async () => ({}) }, search: { expression: () => ({ max_results: () => ({ execute: async () => ({ resources: [] }) }) }) } } } }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.metadata === null ? {} : { metadata: session.metadata } }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));

const storeFindFirst = vi.fn(async (query: any) => {
  const where = query?.where ?? {};
  return where.userId === OWNER && (where.id === undefined || where.id === STORE) ? { id: STORE, userId: OWNER } : null;
});
const emptyFor = (method: string) => {
  if (method.startsWith("findMany") || method === "groupBy") return [];
  if (method === "count") return 0;
  if (method === "aggregate") return { _sum: {}, _count: {} };
  return null;
};
vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async (arg: unknown) => (typeof arg === "function" ? [] : []);
      if (model === "$queryRaw" || model === "$queryRawUnsafe") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => (model === "store" && method === "findFirst" ? storeFindFirst : vi.fn(async () => emptyFor(method))),
      });
    },
  }),
}));

function signIn(role: "owner" | "viewer" | "stranger" | "anon") {
  if (role === "anon") { session.userId = null; session.metadata = null; return; }
  if (role === "owner") { session.userId = OWNER; session.metadata = null; return; }
  if (role === "viewer") { session.userId = VIEWER; session.metadata = { role: "viewer", allowedStoreIds: [STORE] }; return; }
  session.userId = STRANGER;
  session.metadata = { role: "viewer", allowedStoreIds: ["otra-tienda"] };
}

interface RouteCase {
  path: string;
  load: () => Promise<Record<string, unknown>>;
  params: Record<string, string>;
}

/** Devuelve el código de estado, o null si el handler falló después del guardia. */
async function callGet(entry: RouteCase): Promise<number | null> {
  const mod = await entry.load();
  const GET = mod.GET as (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
  try {
    const response = await GET(new Request("https://admin.test/api/store-1/x"), { params: entry.params });
    return response?.status ?? null;
  } catch {
    return null;
  }
}

const READ_ROUTES: RouteCase[] = [
  { path: "bot-replies", load: () => import("@/app/api/[storeId]/bot-replies/route"), params: { storeId: STORE } },
  { path: "boxes/[boxId]", load: () => import("@/app/api/[storeId]/boxes/[boxId]/route"), params: { storeId: STORE, boxId: "box-1" } },
  { path: "boxes", load: () => import("@/app/api/[storeId]/boxes/route"), params: { storeId: STORE } },
  { path: "catalog-migration", load: () => import("@/app/api/[storeId]/catalog-migration/route"), params: { storeId: STORE } },
  { path: "cleanup-images", load: () => import("@/app/api/[storeId]/cleanup-images/route"), params: { storeId: STORE } },
  { path: "coupons/[couponId]", load: () => import("@/app/api/[storeId]/coupons/[couponId]/route"), params: { storeId: STORE, couponId: "coupon-1" } },
  { path: "coupons", load: () => import("@/app/api/[storeId]/coupons/route"), params: { storeId: STORE } },
  { path: "dane/cache", load: () => import("@/app/api/[storeId]/dane/cache/route"), params: { storeId: STORE } },
  { path: "fair-events/[fairEventId]/lookup", load: () => import("@/app/api/[storeId]/fair-events/[fairEventId]/lookup/route"), params: { storeId: STORE, fairEventId: "fair-1" } },
  { path: "fair-events", load: () => import("@/app/api/[storeId]/fair-events/route"), params: { storeId: STORE } },
  { path: "home-content/[homeContentId]", load: () => import("@/app/api/[storeId]/home-content/[homeContentId]/route"), params: { storeId: STORE, homeContentId: "home-1" } },
  { path: "home-content", load: () => import("@/app/api/[storeId]/home-content/route"), params: { storeId: STORE } },
  { path: "marketplaces/mercadolibre/categories/[categoryId]/attributes", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/categories/[categoryId]/attributes/route"), params: { storeId: STORE, categoryId: "MLC1" } },
  { path: "marketplaces/mercadolibre/categories", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/categories/route"), params: { storeId: STORE } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/content-review", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/content-review/route"), params: { storeId: STORE, listingId: "listing-1" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/quality", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/quality/route"), params: { storeId: STORE, listingId: "listing-1" } },
  { path: "marketplaces/mercadolibre/questions", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/questions/route"), params: { storeId: STORE } },
  { path: "marketplaces/mercadolibre", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/route"), params: { storeId: STORE } },
  { path: "offers/[offerId]", load: () => import("@/app/api/[storeId]/offers/[offerId]/route"), params: { storeId: STORE, offerId: "offer-1" } },
  { path: "offers", load: () => import("@/app/api/[storeId]/offers/route"), params: { storeId: STORE } },
  { path: "offers/scope-search", load: () => import("@/app/api/[storeId]/offers/scope-search/route"), params: { storeId: STORE } },
  { path: "presales/[presaleId]/release", load: () => import("@/app/api/[storeId]/presales/[presaleId]/release/route"), params: { storeId: STORE, presaleId: "presale-1" } },
  { path: "presales", load: () => import("@/app/api/[storeId]/presales/route"), params: { storeId: STORE } },
  { path: "products/[productId]/delete-check", load: () => import("@/app/api/[storeId]/products/[productId]/delete-check/route"), params: { storeId: STORE, productId: "product-1" } },
  { path: "products/[productId]/videos", load: () => import("@/app/api/[storeId]/products/[productId]/videos/route"), params: { storeId: STORE, productId: "product-1" } },
  { path: "shipment/cache", load: () => import("@/app/api/[storeId]/shipment/cache/route"), params: { storeId: STORE } },
  { path: "products/[productId]/reviews/[reviewId]", load: () => import("@/app/api/[storeId]/products/[productId]/reviews/[reviewId]/route"), params: { storeId: STORE, productId: "product-1", reviewId: "review-1" } },
];

const HOLD_ROUTES: (RouteCase & { reason: string })[] = [
  { path: "marketplaces/mercadolibre/advertising/overview", load: () => import("@/app/api/[storeId]/marketplaces/mercadolibre/advertising/overview/route"), params: { storeId: STORE }, reason: "Mercado Libre es un módulo solo de la dueña: los anuncios llevan gasto, presupuesto y retorno, y esta ruta no depura nada" },
  { path: "customers/search", load: () => import("@/app/api/[storeId]/customers/search/route"), params: { storeId: STORE }, reason: "datos personales de clientas" },
  { path: "inventory/reconciliation-template", load: () => import("@/app/api/[storeId]/inventory/reconciliation-template/route"), params: { storeId: STORE }, reason: "Movimientos es un módulo solo de la dueña: la plantilla lleva el stock esperado de cada producto" },
  { path: "suppliers", load: () => import("@/app/api/[storeId]/suppliers/route"), params: { storeId: STORE }, reason: "proveedores" },
  { path: "settings", load: () => import("@/app/api/[storeId]/settings/route"), params: { storeId: STORE }, reason: "cuentas bancarias de la tienda" },
  { path: "restock-orders", load: () => import("@/app/api/[storeId]/restock-orders/route"), params: { storeId: STORE }, reason: "costos de compra" },
  { path: "tax-reports", load: () => import("@/app/api/[storeId]/tax-reports/route"), params: { storeId: STORE }, reason: "impuestos" },
];

describe.each(READ_ROUTES)("GET $path", (entry) => {
  it("deja leer a la dueña", async () => {
    signIn("owner");
    expect(await callGet(entry)).not.toBe(403);
  });

  it("deja leer a una cuenta de solo lectura con esta tienda permitida", async () => {
    signIn("viewer");
    const status = await callGet(entry);
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });

  it("rechaza a una cuenta de solo lectura de otra tienda", async () => {
    signIn("stranger");
    expect(await callGet(entry)).toBe(403);
  });

  it("rechaza sin sesión", async () => {
    signIn("anon");
    expect(await callGet(entry)).toBe(401);
  });
});

describe.each(HOLD_ROUTES)("GET $path (reservada: $reason)", (entry) => {
  it("sigue siendo solo de la dueña: la cuenta de solo lectura recibe 403", async () => {
    signIn("viewer");
    expect(await callGet(entry)).toBe(403);
  });

  it("la dueña sigue entrando", async () => {
    signIn("owner");
    expect(await callGet(entry)).not.toBe(403);
  });
});
