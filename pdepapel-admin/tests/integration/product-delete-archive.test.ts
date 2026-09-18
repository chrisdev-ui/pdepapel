import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MarketplaceOutboxAction, MarketplaceProvider } from "@prisma/client";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Eliminar nombra lo que bloquea y ofrece archivar; archivar pausa Mercado Libre (Productos 2A). */
describe("product delete guard and archive with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let connectionId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (connectionId) {
      await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
      connectionId = undefined;
    }
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("names the kit that uses the component and refuses to delete it", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { GET } = await import("@/app/api/[storeId]/products/[productId]/delete-check/route");
    const check = await GET(json("GET"), { params: { storeId: fixture.store.id, productId: fixture.component.id } });
    expect(check.status).toBe(200);
    const payload = (await check.json()) as { blocked: boolean; blockers: { kind: string; detail: string }[] };
    expect(payload.blocked).toBe(true);
    expect(payload.blockers.map((b) => b.kind)).toEqual(["kits"]);
    expect(payload.blockers[0].detail).toContain("Kit");

    const { DELETE } = await import("@/app/api/[storeId]/products/[productId]/route");
    const response = await DELETE(json("DELETE"), { params: { storeId: fixture.store.id, productId: fixture.component.id } });
    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/Archívalo/);
    await expect(testPrisma.product.findUnique({ where: { id: fixture.component.id } })).resolves.not.toBeNull();
  });

  it("deletes a product nothing depends on and keeps foreign ids out", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { GET } = await import("@/app/api/[storeId]/products/[productId]/delete-check/route");
    const check = await GET(json("GET"), { params: { storeId: fixture.store.id, productId: fixture.kit.id } });
    expect(((await check.json()) as { blocked: boolean }).blocked).toBe(false);

    const { DELETE } = await import("@/app/api/[storeId]/products/[productId]/route");
    const response = await DELETE(json("DELETE"), { params: { storeId: fixture.store.id, productId: fixture.kit.id } });
    expect(response.status).toBe(200);
    await expect(testPrisma.product.findUnique({ where: { id: fixture.kit.id } })).resolves.toBeNull();
  });

  it("queues a pause for the active Mercado Libre listing when the product is archived, from the form and in bulk", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: fixture.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: "CONNECTED" },
    });
    connectionId = connection.id;
    const listing = await testPrisma.marketplaceListing.create({
      data: { connectionId: connection.id, productId: fixture.component.id, externalItemId: "MCO-1", status: "ACTIVE" },
    });
    await testPrisma.image.create({ data: { productId: fixture.component.id, url: "https://images.test/c.jpg", isMain: true } });
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });

    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const response = await PATCH(
      json("PATCH", {
        name: product.name, price: product.price, acqPrice: product.acqPrice,
        categoryId: product.categoryId, sizeId: product.sizeId, colorId: product.colorId, designId: product.designId,
        description: product.description, images: [{ url: "https://images.test/c.jpg", isMain: true }],
        preserveSlug: true, hasNoProductIdentifier: true, isArchived: true,
      }),
      { params: { storeId: fixture.store.id, productId: product.id } },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { pausedListings: number }).pausedListings).toBe(1);
    const event = await testPrisma.marketplaceOutboxEvent.findFirst({ where: { listingId: listing.id, action: MarketplaceOutboxAction.SYNC_LISTING_STATUS } });
    expect(event?.payload).toMatchObject({ targetStatus: "paused" });

    // Restaurar y volver a archivar en lote: misma pausa, contada en la respuesta.
    await testPrisma.product.update({ where: { id: product.id }, data: { isArchived: false } });
    await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { listingId: listing.id } });
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const bulk = await POST(
      json("POST", { productIds: [product.id, "id-de-otra-tienda"], field: "isArchived", value: true }),
      { params: { storeId: fixture.store.id } },
    );
    expect(bulk.status).toBe(200);
    expect(await bulk.json()).toMatchObject({ updated: 1, pausedListings: 1 });
    await expect(testPrisma.marketplaceOutboxEvent.count({ where: { listingId: listing.id } })).resolves.toBe(1);
  });

  it("previews the real sibling count of a group before applying in bulk", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const group = await testPrisma.productGroup.create({
      data: { name: "Grupo", slug: `grupo-${fixture.store.id}`, description: "x", storeId: fixture.store.id },
    });
    await testPrisma.product.updateMany({ where: { id: { in: [fixture.component.id, fixture.kit.id] } }, data: { productGroupId: group.id } });
    await testPrisma.product.update({ where: { id: fixture.kit.id }, data: { isArchived: true } });
    const { POST } = await import("@/app/api/[storeId]/products/bulk-update/route");
    const preview = await POST(
      json("POST", { productIds: [fixture.component.id], productGroupIds: [group.id], field: "isFeatured", value: true, preview: true }),
      { params: { storeId: fixture.store.id } },
    );
    expect(await preview.json()).toEqual({ affected: 2, siblings: { total: 1, archived: 1 } });
    await expect(testPrisma.product.count({ where: { storeId: fixture.store.id, isFeatured: true } })).resolves.toBe(0);
    await testPrisma.product.updateMany({ where: { productGroupId: group.id }, data: { productGroupId: null } });
    await testPrisma.productGroup.delete({ where: { id: group.id } });
  });
});
