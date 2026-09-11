/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Dashboard-only API handlers must reject a signed-in customer who does not
 * own the store (403) and an anonymous caller (401). The Clerk middleware
 * marks every /api path public, so this check inside each handler is the
 * only thing standing between a store customer and the admin data.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;

interface ProtectedRoute {
  path: string;
  methods: Method[];
  /** Extra route params besides storeId. */
  params?: Record<string, string>;
}

const PROTECTED_ROUTES: ProtectedRoute[] = [
  { path: "cleanup-images", methods: ["GET", "DELETE"] },
  { path: "custom-orders", methods: ["GET", "POST"] },
  { path: "custom-orders/[customOrderId]", methods: ["GET", "PATCH", "DELETE"], params: { customOrderId: "x" } },
  { path: "custom-orders/[customOrderId]/convert", methods: ["POST"], params: { customOrderId: "x" } },
  { path: "customers/search", methods: ["GET"] },
  { path: "dane/cache", methods: ["GET", "POST", "DELETE"] },
  { path: "invoices", methods: ["GET", "POST"] },
  { path: "orders/[orderId]/shipping", methods: ["POST"], params: { orderId: "x" } },
  { path: "products/selectable", methods: ["GET"] },
  { path: "quotations", methods: ["GET", "POST"] },
  { path: "quotations/[quotationId]", methods: ["GET", "PATCH", "DELETE"], params: { quotationId: "x" } },
  { path: "quotations/[quotationId]/use", methods: ["POST"], params: { quotationId: "x" } },
  { path: "shipment/[shippingId]", methods: ["GET", "PATCH", "DELETE"], params: { shippingId: "x" } },
  { path: "shipment/cache", methods: ["GET", "DELETE"] },
  { path: "shipment/cancel", methods: ["POST"] },
  { path: "shipments", methods: ["GET"] },
  { path: "shipments/bulk-update", methods: ["PATCH"] },
  { path: "shipments/export", methods: ["GET"] },
  { path: "whatsapp/messages", methods: ["GET", "POST"] },
  { path: "whatsapp/templates", methods: ["GET", "POST"] },
  { path: "whatsapp/templates/[templateId]", methods: ["PATCH", "DELETE"], params: { templateId: "x" } },
  // Handlers that already had an inline owner lookup: kept under test so they cannot regress.
  { path: "customers/reactivation", methods: ["GET", "POST"] },
  { path: "shipments/sync", methods: ["POST"] },
  { path: "orders/[orderId]/shipping/create-guide", methods: ["POST"], params: { orderId: "x" } },
  { path: "orders/[orderId]/shipping/clear-rate", methods: ["DELETE"], params: { orderId: "x" } },
  { path: "products", methods: ["POST", "DELETE"] },
  { path: "coupons", methods: ["POST"] },
  // Lecturas que solo usa el panel (auditoría de exposición pública, 2026-09-11):
  // devolvían filas completas (costos, proveedor, cupones, cajas, reseñas con
  // nota de moderación) a cualquier visitante.
  { path: "product-groups", methods: ["GET"] },
  { path: "product-groups/[productGroupId]", methods: ["GET"], params: { productGroupId: "x" } },
  { path: "suppliers", methods: ["GET"] },
  { path: "suppliers/[supplierId]", methods: ["GET"], params: { supplierId: "x" } },
  { path: "products/catalog", methods: ["GET"] },
  { path: "offers", methods: ["GET"] },
  { path: "offers/[offerId]", methods: ["GET"], params: { offerId: "x" } },
  { path: "boxes", methods: ["GET"] },
  { path: "boxes/[boxId]", methods: ["GET"], params: { boxId: "x" } },
  { path: "coupons", methods: ["GET"] },
  { path: "coupons/[couponId]", methods: ["GET"], params: { couponId: "x" } },
  { path: "products/[productId]/reviews/[reviewId]", methods: ["GET"], params: { productId: "x", reviewId: "x" } },
  // Gestión de publicaciones de Mercado Libre (auditoría 2026-09-11).
  { path: "marketplaces/mercadolibre/listings", methods: ["GET", "POST"] },
  { path: "marketplaces/mercadolibre/listings/bulk", methods: ["POST"] },
  { path: "marketplaces/mercadolibre/listings/import", methods: ["POST"] },
  { path: "marketplaces/mercadolibre/listings/import/preview", methods: ["POST"] },
  { path: "marketplaces/mercadolibre/listings/[listingId]", methods: ["PATCH", "DELETE"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/publish", methods: ["POST"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/sync-content", methods: ["POST"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/content-review", methods: ["GET"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/quality", methods: ["GET"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/quality/video-reminder", methods: ["POST", "DELETE"], params: { listingId: "x" } },
  { path: "marketplaces/mercadolibre/listings/[listingId]/sale-conditions", methods: ["GET", "PATCH"], params: { listingId: "x" } },
];
// Bulk handlers (products PATCH, orders PATCH/DELETE, coupons PATCH/DELETE,
// shipments/bulk-manual-update) validate the id list before authorizing, so an
// empty body answers 400 first; they keep their owner check but are not in
// this table. POST /orders is the public checkout and stays open on purpose.

const modules = import.meta.glob("../../app/api/[[]storeId[]]/**/route.ts");

async function loadHandler(path: string, method: Method): Promise<Handler> {
  const key = `../../app/api/[storeId]/${path}/route.ts`;
  const loader = modules[key];
  if (!loader) throw new Error(`No route module for ${key}`);
  const mod = (await loader()) as Record<string, Handler>;
  const handler = mod[method];
  if (!handler) throw new Error(`${path} does not export ${method}`);
  return handler;
}

const call = (handler: Handler, method: Method, storeId: string, params: Record<string, string> = {}) =>
  handler(
    new Request(`http://admin.test/api/${storeId}/x`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({}),
    }),
    { params: { storeId, ...params } },
  );

describe("store-owner authorization on dashboard API handlers", () => {
  const ownerId = `owner-${randomUUID()}`;
  const strangerId = `customer-${randomUUID()}`;
  let storeId = "";

  beforeAll(async () => {
    const store = await testPrisma.store.create({
      data: { name: `Tienda autorización ${randomUUID()}`, userId: ownerId },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await testPrisma.store.deleteMany({ where: { id: storeId } });
    await testPrisma.$disconnect();
  });

  for (const route of PROTECTED_ROUTES) {
    for (const method of route.methods) {
      it(`${method} ${route.path} rejects a signed-in customer of another store with 403`, async () => {
        session.userId = strangerId;
        const handler = await loadHandler(route.path, method);
        const response = await call(handler, method, storeId, route.params);
        expect(response.status).toBe(403);
      });

      it(`${method} ${route.path} rejects an anonymous caller with 401`, async () => {
        session.userId = null;
        const handler = await loadHandler(route.path, method);
        const response = await call(handler, method, storeId, route.params);
        expect(response.status).toBe(401);
      });
    }
  }

  it("lets the owner through the read-only handlers", async () => {
    session.userId = ownerId;
    for (const [path, method] of [
      ["shipments", "GET"],
      ["quotations", "GET"],
      ["whatsapp/templates", "GET"],
      ["customers/search", "GET"],
      ["products/selectable", "GET"],
      ["product-groups", "GET"],
      ["suppliers", "GET"],
      ["offers", "GET"],
      ["boxes", "GET"],
      ["products/catalog", "GET"],
    ] as const) {
      const handler = await loadHandler(path, method);
      const response = await call(handler, method, storeId);
      expect([401, 403], `${method} ${path}`).not.toContain(response.status);
    }
  });
});
