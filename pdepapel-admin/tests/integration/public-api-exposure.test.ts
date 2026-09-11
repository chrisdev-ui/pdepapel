/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { INTERNAL_PRODUCT_FIELDS } from "@/lib/public-catalog";
import { INTERNAL_ORDER_FIELDS } from "@/lib/public-orders";
import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Auditoría de exposición pública (2026-09-11): las rutas que la tienda en
 * línea usa sin sesión devolvían filas completas de Prisma. Cada prueba llama
 * al handler real contra MySQL como visitante anónimo y comprueba que los
 * campos internos no salgan; la dueña sigue recibiendo la fila completa.
 */
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
// Sin Upstash en la máquina de pruebas: la caché del listado no es lo que se
// prueba aquí y sus reintentos de red harían lenta cada llamada.
vi.mock("@upstash/redis", () => {
  const client = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    scan: async () => [0, []],
  };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
  }
  return { Redis };
});

const get = (url: string) => new Request(url, { headers: { Origin: "https://papeleriapdepapel.com" } });

function expectNoInternalFields(record: Record<string, unknown>, fields: readonly string[]) {
  for (const field of fields) expect(record, `campo interno «${field}»`).not.toHaveProperty(field);
}

describe("public API exposure with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.review.deleteMany({ where: { storeId: fixture.store.id } });
      // Los proveedores cuelgan de la tienda: se borran antes que ella.
      await testPrisma.product.updateMany({
        where: { storeId: fixture.store.id },
        data: { supplierId: null },
      });
      await testPrisma.supplier.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function linkSupplier(store: string, productId: string) {
    const supplier = await testPrisma.supplier.create({
      data: { name: `Proveedor ${randomUUID()}`, storeId: store },
    });
    await testPrisma.product.update({ where: { id: productId }, data: { supplierId: supplier.id } });
    return supplier;
  }

  it("lists products for the storefront without cost, supplier or classification data", async () => {
    fixture = await createInventoryFixture();
    await linkSupplier(fixture.store.id, fixture.component.id);
    const { GET } = await import("@/app/api/[storeId]/products/route");

    for (const query of ["skipCache=true", "skipCache=true&includeSupplier=true", `skipCache=true&ids=${fixture.component.id}`]) {
      const response = await GET(get(`http://admin.test/api/x/products?${query}`), {
        params: { storeId: fixture.store.id },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      const products: Record<string, unknown>[] = Array.isArray(body) ? body : body.products;
      const product = products.find((item) => item.id === fixture!.component.id);
      expect(product, query).toBeDefined();
      expect(product).toMatchObject({ price: 10000, stock: 6 });
      expectNoInternalFields(product!, INTERNAL_PRODUCT_FIELDS);
      expect(product!.category).not.toHaveProperty("storeId");
    }
  });

  it("gives visitors the public product detail and the owner the full row", async () => {
    fixture = await createInventoryFixture();
    const supplier = await linkSupplier(fixture.store.id, fixture.component.id);
    const { GET } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { storeId: fixture.store.id, productId: fixture.component.id };

    const visitor = await GET(get("http://admin.test/api/x/products/p?scope=storefront"), { params });
    expect(visitor.status).toBe(200);
    const publicProduct = await visitor.json();
    expectNoInternalFields(publicProduct, INTERNAL_PRODUCT_FIELDS);
    expect(publicProduct).toMatchObject({ id: fixture.component.id, price: 10000 });

    session.userId = fixture.store.userId;
    const owner = await GET(get("http://admin.test/api/x/products/p"), { params });
    expect(owner.status).toBe(200);
    const ownerProduct = await owner.json();
    expect(ownerProduct.acqPrice).toBe(4000);
    expect(ownerProduct.supplier).toMatchObject({ id: supplier.id, name: supplier.name });
  });

  it("answers the storefront order page without token, notes, profit or the creator id", async () => {
    fixture = await createInventoryFixture();
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        fullName: "Clienta Prueba",
        phone: "3000000000",
        email: "clienta@example.com",
        address: "Calle 1 # 2-3",
        documentId: "123456789",
        token: `tok-${randomUUID()}`,
        adminNotes: "nota admin",
        internalNotes: "nota interna",
        netProfit: 1234,
        totalProductCost: 4000,
        gatewayFee: 100,
        createdBy: "user_admin",
        subtotal: 10000,
        total: 10000,
        orderItems: {
          create: [{ productId: fixture.component.id, quantity: 1, name: "Componente", price: 10000 }],
        },
      },
    });
    const { GET } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const params = { storeId: fixture.store.id, orderId: order.id };

    const visitor = await GET(get("http://admin.test/api/x/orders/o"), { params });
    expect(visitor.status).toBe(200);
    const publicOrder = await visitor.json();
    expect(publicOrder).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
      email: "clienta@example.com",
      total: 10000,
      createdByAdmin: true,
    });
    expectNoInternalFields(publicOrder, INTERNAL_ORDER_FIELDS);
    expect(publicOrder.orderItems).toHaveLength(1);
    expect(publicOrder.orderItems[0].product).toMatchObject({ id: fixture.component.id, price: 10000 });
    expectNoInternalFields(publicOrder.orderItems[0].product, INTERNAL_PRODUCT_FIELDS);

    const otherStore = await GET(get("http://admin.test/api/x/orders/o"), {
      params: { storeId: "another-store", orderId: order.id },
    });
    expect(otherStore.status).toBe(404);

    session.userId = fixture.store.userId;
    const owner = await GET(get("http://admin.test/api/x/orders/o"), { params });
    expect(owner.status).toBe(200);
    const ownerOrder = await owner.json();
    expect(ownerOrder.token).toBe(order.token);
    expect(ownerOrder.netProfit).toBe(1234);
  });

  it("serves a quotation by token with the description but no internal fields", async () => {
    fixture = await createInventoryFixture();
    const token = `quote-${randomUUID()}`;
    await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `COT-${randomUUID().slice(0, 8)}`,
        fullName: "Clienta Cotización",
        phone: "3000000001",
        token,
        adminNotes: "Descripción visible de la cotización",
        internalNotes: "solo panel",
        netProfit: 999,
        createdBy: "user_admin",
        subtotal: 10000,
        total: 10000,
        orderItems: {
          create: [{ productId: fixture.component.id, quantity: 1, name: "Componente", price: 10000 }],
        },
      },
    });
    const { GET } = await import("@/app/api/[storeId]/public/custom-orders/[token]/route");

    const response = await GET(get("http://admin.test/api/x/public/custom-orders/t"), {
      params: { storeId: fixture.store.id, token },
    });
    expect(response.status).toBe(200);
    const quotation = await response.json();
    expect(quotation.description).toBe("Descripción visible de la cotización");
    expect(quotation.orderItems[0].product).toMatchObject({ id: fixture.component.id });
    expectNoInternalFields(quotation, INTERNAL_ORDER_FIELDS);

    const wrongStore = await GET(get("http://admin.test/api/x/public/custom-orders/t"), {
      params: { storeId: "another-store", token },
    });
    expect(wrongStore.status).toBe(404);
  });

  it("publishes reviews without the reviewer id and lets the author find her own", async () => {
    fixture = await createInventoryFixture();
    const review = await testPrisma.review.create({
      data: {
        storeId: fixture.store.id,
        productId: fixture.component.id,
        userId: "user_reviewer",
        name: "Ana",
        rating: 5,
        comment: "Divino",
      },
    });
    const listRoute = await import("@/app/api/[storeId]/products/[productId]/reviews/route");
    const homeRoute = await import("@/app/api/[storeId]/reviews/route");
    const mineRoute = await import("@/app/api/[storeId]/products/[productId]/reviews/mine/route");
    const params = { storeId: fixture.store.id, productId: fixture.component.id };

    const list = await (await listRoute.GET(get("http://admin.test/api/x/r"), { params })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: review.id, name: "Ana", rating: 5 });
    expect(list[0]).not.toHaveProperty("userId");
    expect(list[0]).not.toHaveProperty("moderationNote");

    const home = await (await homeRoute.GET(get("http://admin.test/api/x/reviews?limit=5"), { params })).json();
    expect(home.reviews[0]).not.toHaveProperty("userId");

    const anonymous = await mineRoute.GET(get("http://admin.test/api/x/mine"), { params });
    expect(anonymous.status).toBe(401);

    session.userId = "user_reviewer";
    const mine = await (await mineRoute.GET(get("http://admin.test/api/x/mine"), { params })).json();
    expect(mine.review).toMatchObject({ id: review.id, rating: 5 });

    session.userId = "user_other";
    const other = await (await mineRoute.GET(get("http://admin.test/api/x/mine"), { params })).json();
    expect(other.review).toBeNull();
  });
});
