import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getInventoryPage } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { INVENTORY_VIEWS } from "@/lib/inventory-views";
import { parseInventoryListQuery } from "@/lib/inventory-list-query";

/**
 * Inventario paginado en el servidor contra MySQL: al navegador baja una
 * página de 25, cada pestaña cuenta lo que lista, y la cuenta de solo lectura
 * no recibe costos ni proveedora aunque los pida por la URL.
 */
let fixture: InventoryFixture | undefined;
let supplierId = "";
let extraIds: string[] = [];

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const suffix = randomUUID().slice(0, 8);
  supplierId = (await testPrisma.supplier.create({ data: { storeId: store, name: `Henko ${suffix}` } as never })).id;
  await testPrisma.product.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      storeId: store,
      categoryId: fixture!.category.id,
      sizeId: fixture!.component.sizeId,
      colorId: fixture!.component.colorId,
      designId: fixture!.component.designId,
      name: i === 0 ? "Lápiz HB" : `Inventario ${i}`,
      slug: `inventario-${suffix}-${i}`,
      sku: `INV-${suffix}-${i}`,
      description: "Producto de pruebas",
      price: 8000,
      acqPrice: i % 4 === 0 ? 0 : 3000,
      stock: i % 3 === 0 ? 0 : i % 5,
      supplierId: i % 2 === 0 ? supplierId : null,
    })) as never,
  });
  extraIds = (await testPrisma.product.findMany({ where: { storeId: store, sku: { startsWith: `INV-${suffix}` } }, select: { id: true }, orderBy: { name: "asc" } })).map((row) => row.id);
  // Ventas pagadas de ayer en dos productos de la proveedora (uno agotado): entran en «Por reponer».
  const henkoProducts = await testPrisma.product.findMany({ where: { id: { in: extraIds }, supplierId }, select: { id: true }, take: 2 });
  await testPrisma.order.create({
    data: {
      storeId: store, orderNumber: `ORD-INV-${suffix}`, status: OrderStatus.PAID, type: OrderType.STANDARD, fullName: "Cliente", phone: "3000000000", address: "Calle 1", email: "c@test.com",
      subtotal: 1, total: 1, paidAt: new Date(Date.now() - 86_400_000),
      payment: { create: { method: PaymentMethod.CASH, storeId: store } },
      orderItems: { create: henkoProducts.map((product) => ({ productId: product.id, quantity: 9, name: "Venta", price: 1 })) },
    },
  });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.orderItem.deleteMany({ where: { order: { storeId: fixture.store.id } } });
    await testPrisma.paymentDetails.deleteMany({ where: { order: { storeId: fixture.store.id } } });
    await testPrisma.order.deleteMany({ where: { storeId: fixture.store.id } });
    await testPrisma.product.deleteMany({ where: { id: { in: extraIds } } });
    await testPrisma.supplier.deleteMany({ where: { id: supplierId } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_inventory";
  session.claims = role === "owner" ? {} : { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } };
};
const load = (search: string) => getInventoryPage(fixture!.store.id, parseInventoryListQuery(new URLSearchParams(search)));

describe("getInventoryPage (MySQL)", () => {
  it("baja 25 filas por página y cada pestaña cuenta lo que listan sus páginas", async () => {
    signIn("owner");
    const { counts } = await load("");
    expect(counts.todo).toBe(await testPrisma.product.count({ where: { storeId: fixture!.store.id, isArchived: false } }));
    for (const view of INVENTORY_VIEWS) {
      const first = await load(`vista=${view.id}`);
      const ids = [...first.rows.map((row) => row.id)];
      for (let page = 2; page <= first.pageCount; page += 1) ids.push(...(await load(`vista=${view.id}&pagina=${page}`)).rows.map((row) => row.id));
      expect(first.rows.length).toBeLessThanOrEqual(25);
      expect(new Set(ids).size, view.id).toBe(counts[view.id]);
    }
    expect((await load("vista=todo&q=lapiz")).rows.map((row) => row.name)).toEqual(["Lápiz HB"]);
  });

  it("agrupado: la proveedora y sus filas salen del servidor", async () => {
    signIn("owner");
    const grouped = await load("agrupar=proveedor");
    expect(grouped.rows).toEqual([]);
    const henko = grouped.groups!.find((group) => group.id === supplierId);
    expect(henko?.rows.length).toBeGreaterThan(0);
    expect(henko?.rows.every((row) => row.supplier?.id === supplierId)).toBe(true);
  });

  it("la cuenta de solo lectura no recibe costos, proveedora ni «Sin costo» aunque los pida por la URL", async () => {
    signIn("viewer");
    const viewer = await load("vista=sin-costo&orden=-acqPrice&agrupar=proveedor");
    expect(viewer.query).toMatchObject({ view: "por-reponer", sort: null, groupBySupplier: false });
    expect(viewer.groups).toBeNull();
    expect(viewer.totals.costValue).toBe(0);
    const all = await load("vista=todo");
    for (const row of all.rows) {
      expect(row).not.toHaveProperty("acqPrice");
      expect(row).not.toHaveProperty("supplier");
      expect(row).not.toHaveProperty("lastCost");
    }
  });
});
