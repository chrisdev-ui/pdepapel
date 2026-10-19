import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VIEWER_HIDDEN_PRODUCT_FIELDS } from "@/lib/viewer-payloads";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El catálogo PDF (`GET /products/catalog`) deja entrar a la cuenta de solo
 * lectura: tiene que llegarle sin costo de compra, transporte ni proveedor. A
 * la dueña, igual que siempre.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
const offers = vi.hoisted(() => ({ getProductsPrices: vi.fn() }));
vi.mock("@/lib/discount-engine", () => ({
  getActiveOffers: async () => [],
  getProductsPrices: offers.getProductsPrices,
}));

let fixture: InventoryFixture | undefined;

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  await testPrisma.product.update({ where: { id: fixture.component.id }, data: { transportationCost: 500 } });
  await testPrisma.image.createMany({
    data: [
      { productId: fixture.component.id, url: "https://res.cloudinary.com/demo/image/upload/v1/otra.png", isMain: false },
      { productId: fixture.component.id, url: "https://res.cloudinary.com/demo/image/upload/v1/principal.jpg", isMain: true },
    ],
  });
  // Como en producción: las políticas guardadas como texto JSON.
  await testPrisma.store.update({ where: { id: fixture.store.id }, data: { policies: JSON.stringify({}) } });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.image.deleteMany({ where: { productId: fixture.component.id } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

async function catalogAs(role: "owner" | "viewer") {
  offers.getProductsPrices.mockReset();
  offers.getProductsPrices.mockImplementation(async (products: { id: string; price: number }[]) =>
    new Map(products.map((product) => [product.id, { price: product.price - 1000, originalPrice: product.price, discount: 1000, offerLabel: "-10%", matchedOfferId: "o-1" }])),
  );
  const store = fixture!.store.id;
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_catalog";
  session.claims = role === "owner" ? {} : { metadata: { role: "viewer", allowedStoreIds: [store] } };
  const { GET } = await import("@/app/api/[storeId]/products/catalog/route");
  const response = await GET(new Request("http://admin.test/catalog"), { params: { storeId: store } });
  expect(response.status).toBe(200);
  return (await response.json()) as { products: Record<string, unknown>[] };
}

describe("catálogo PDF y la cuenta de solo lectura (MySQL)", () => {
  it("a la cuenta de solo lectura le llega sin ningún campo interno del producto", async () => {
    const { products } = await catalogAs("viewer");
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      for (const hidden of VIEWER_HIDDEN_PRODUCT_FIELDS) expect(product, hidden).not.toHaveProperty(hidden);
    }
  });

  it("a la dueña le llega solo lo que dibuja el PDF: sin costos, una foto ya en la copia 400×344 y el precio con oferta leído una sola vez", async () => {
    const { products } = await catalogAs("owner");
    expect(offers.getProductsPrices).toHaveBeenCalledTimes(1);
    const component = products.find((product) => product.id === fixture!.component.id)!;
    expect(Object.keys(component).sort()).toEqual(["category", "color", "id", "images", "name", "offerLabel", "originalPrice", "price", "size", "sku", "stock"]);
    expect(component).toMatchObject({ price: 9000, originalPrice: 10000, offerLabel: "-10%", stock: 6, category: { name: "Agendas" } });
    expect(component.images).toEqual([{ url: "https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_344,q_auto/v1/principal.jpg", isMain: true }]);
    for (const hidden of VIEWER_HIDDEN_PRODUCT_FIELDS) expect(component, hidden).not.toHaveProperty(hidden);
  });

  it("las políticas de la tienda funcionan guardadas como texto o como objeto (antes el objeto daba 500)", async () => {
    const store = fixture!.store.id;
    await testPrisma.store.update({ where: { id: store }, data: { policies: { shipping: "2 a 6 días" } } });
    expect(((await catalogAs("owner")) as unknown as { store: { policies: unknown } }).store.policies).toEqual({ shipping: "2 a 6 días" });
    await testPrisma.store.update({ where: { id: store }, data: { policies: JSON.stringify({ shipping: "2 a 6 días" }) } });
    expect(((await catalogAs("owner")) as unknown as { store: { policies: unknown } }).store.policies).toEqual({ shipping: "2 a 6 días" });
  });
});
