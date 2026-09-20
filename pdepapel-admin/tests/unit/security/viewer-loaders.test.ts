import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las cargas de servidor que rinden las pantallas. Para una cuenta de solo
 * lectura tienen que **devolver datos** (no un 403) y llegar sin el dinero de
 * la casa ni el contacto de las clientas; para la dueña, exactamente lo mismo
 * que antes de esta tanda.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, metadata: null as unknown }));
const OWNER = "user_owner";
const VIEWER = "user_viewer";
const STORE = "store-1";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.metadata === null ? {} : { metadata: session.metadata } }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@upstash/redis", () => ({ Redis: class { static fromEnv() { return new this(); } async get() { return null; } async set() { return "OK"; } } }));

const product = {
  id: "p-1", name: "Libreta", sku: "LIB-1", price: 12000, stock: 5,
  acqPrice: 5000, transportationCost: 300, supplierId: "sup-1",
  images: [], _count: { images: 0 }, categoryId: "c", productGroupId: null, isKit: false,
  color: null, isArchived: false, isFeatured: false, availableAt: null, slug: "libreta",
  gtin: null, hasNoProductIdentifier: false, kitComponents: [],
};
const order = {
  id: "o-1", orderNumber: "ORD-1", status: "PAID", total: 50000, subtotal: 50000,
  fullName: "Ana Pérez", email: "ana@x.com", phone: "300", address: "Calle 1", city: "Bogotá",
  department: "Cundinamarca", documentId: "CC1", netProfit: 20000, totalProductCost: 30000,
  orderItems: [], _count: { inventoryIssues: 0 }, createdAt: new Date(), payment: null, shipping: null,
};

const storeFindFirst = vi.fn(async (query: any) =>
  query?.where?.userId === OWNER && (query?.where?.id === undefined || query?.where?.id === STORE)
    ? { id: STORE, userId: OWNER }
    : null,
);

vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "$transaction") return async () => [];
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "store" && method === "findFirst") return storeFindFirst;
          if (model === "product" && method.startsWith("findMany")) return async () => [product];
          if (model === "order" && method.startsWith("findMany")) return async () => [order];
          if (method.startsWith("findMany") || method === "groupBy") return async () => [];
          if (method === "count") return async () => 0;
          return async () => null;
        },
      });
    },
  }),
}));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: async () => new Map() }));

import { getProducts } from "@/app/(dashboard)/[storeId]/(routes)/productos/server/get-products";
import { getOrders } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/server/get-orders";
import { getCategories } from "@/app/(dashboard)/[storeId]/(routes)/categorias/server/get-categories";

function signIn(role: "owner" | "viewer" | "stranger" | "anon") {
  if (role === "anon") { session.userId = null; session.metadata = null; return; }
  if (role === "owner") { session.userId = OWNER; session.metadata = null; return; }
  if (role === "viewer") { session.userId = VIEWER; session.metadata = { role: "viewer", allowedStoreIds: [STORE] }; return; }
  session.userId = "user_x";
  session.metadata = { role: "viewer", allowedStoreIds: ["otra"] };
}

beforeEach(() => {
  storeFindFirst.mockClear();
  session.userId = null;
  session.metadata = null;
});

describe("catálogo para una cuenta de solo lectura", () => {
  it("entrega los productos sin costo de compra, transporte ni proveedor", async () => {
    signIn("viewer");
    const rows = (await getProducts(STORE)) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "p-1", name: "Libreta", price: 12000 });
    for (const hidden of ["acqPrice", "transportationCost", "supplierId"]) {
      expect(rows[0], hidden).not.toHaveProperty(hidden);
    }
  });

  it("a la dueña le entrega el costo de siempre", async () => {
    signIn("owner");
    const rows = (await getProducts(STORE)) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ acqPrice: 5000, transportationCost: 300, supplierId: "sup-1" });
  });

  it("no entrega nada a una sesión ajena ni sin sesión", async () => {
    signIn("stranger");
    await expect(getProducts(STORE)).rejects.toMatchObject({ statusCode: 403 });
    signIn("anon");
    await expect(getProducts(STORE)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("pedidos para una cuenta de solo lectura", () => {
  it("entrega la lista sin contacto ni utilidad, pero con la ciudad de la venta", async () => {
    signIn("viewer");
    const rows = (await getOrders(STORE)) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ orderNumber: "ORD-1", status: "PAID", total: 50000 });
    for (const hidden of ["fullName", "email", "phone", "address", "documentId", "netProfit", "totalProductCost"]) {
      expect(rows[0], hidden).not.toHaveProperty(hidden);
    }
    // La ciudad y el departamento se conservan: dicen de dónde vienen las ventas.
    expect(rows[0]).toMatchObject({ city: "Bogotá", department: "Cundinamarca" });
  });

  it("a la dueña le entrega el pedido completo", async () => {
    signIn("owner");
    const rows = (await getOrders(STORE)) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ fullName: "Ana Pérez", phone: "300", netProfit: 20000 });
  });
});

describe("pantallas sin nada sensible", () => {
  it("las categorías se abren a una cuenta de solo lectura", async () => {
    signIn("viewer");
    await expect(getCategories(STORE)).resolves.toEqual([]);
    signIn("stranger");
    await expect(getCategories(STORE)).rejects.toMatchObject({ statusCode: 403 });
  });
});
