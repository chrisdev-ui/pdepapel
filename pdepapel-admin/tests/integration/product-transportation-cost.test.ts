import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * «Envío y otros gastos» se mostraba en Productos y se descartaba al guardar.
 * Ahora se conserva y Mercado Libre lo suma al piso de precio.
 */
describe("product transportation cost with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("persists the per-unit extra cost sent by the product form and exposes it to the product search", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const product = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
      include: { images: true },
    });
    await testPrisma.image.create({
      data: { productId: product.id, url: "https://images.test/componente.jpg", isMain: true },
    });

    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const response = await PATCH(
      json("PATCH", {
        name: product.name,
        price: product.price,
        acqPrice: product.acqPrice,
        transportationCost: 750,
        categoryId: product.categoryId,
        sizeId: product.sizeId,
        colorId: product.colorId,
        designId: product.designId,
        description: product.description,
        images: [{ url: "https://images.test/componente.jpg" }],
        preserveSlug: true,
        hasNoProductIdentifier: true,
      }),
      { params: { storeId: fixture.store.id, productId: product.id } },
    );
    expect(response.status).toBe(200);
    await expect(
      testPrisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({ transportationCost: 750 });

    const { GET } = await import("@/app/api/[storeId]/products/search/route");
    const search = await GET(
      new Request(`http://admin.test/api/x?q=${encodeURIComponent(product.sku)}`),
      { params: { storeId: fixture.store.id } },
    );
    expect(search.status).toBe(200);
    const { data: results } = (await search.json()) as {
      data: { id: string; transportationCost: number | null }[];
    };
    expect(results.find((item) => item.id === product.id)).toMatchObject({ transportationCost: 750 });
  });
});
