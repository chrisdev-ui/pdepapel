import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { RestockOrderStatus } from "@prisma/client";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Guardas de proveedores: nombre único por tienda sin distinguir mayúsculas
 * (409 en español antes de tocar el índice), borrado bloqueado cuando hay
 * productos o pedidos de aprovisionamiento, y lectura siempre por tienda.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({
    users: { getUser: vi.fn().mockResolvedValue(null) },
  }),
}));

const collectionRoute = () => import("@/app/api/[storeId]/suppliers/route");
const detailRoute = () =>
  import("@/app/api/[storeId]/suppliers/[supplierId]/route");
const loader = () =>
  import(
    "@/app/(dashboard)/[storeId]/(routes)/proveedores/[supplierId]/server/get-supplier"
  );
const listLoader = () =>
  import("@/app/(dashboard)/[storeId]/(routes)/proveedores/server/get-suppliers");

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("guardas de proveedores", () => {
  let fixture: InventoryFixture | undefined;
  let otherStoreId: string | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    const storeIds = [fixture?.store.id, otherStoreId].filter(
      (id): id is string => Boolean(id),
    );
    if (storeIds.length > 0) {
      const restockOrders = await testPrisma.restockOrder.findMany({
        where: { storeId: { in: storeIds } },
        select: { id: true },
      });
      const restockOrderIds = restockOrders.map((order) => order.id);
      if (restockOrderIds.length > 0) {
        await testPrisma.restockOrderItem.deleteMany({
          where: { restockOrderId: { in: restockOrderIds } },
        });
        await testPrisma.restockOrder.deleteMany({
          where: { id: { in: restockOrderIds } },
        });
      }
      await testPrisma.product.updateMany({
        where: { storeId: { in: storeIds } },
        data: { supplierId: null },
      });
      await testPrisma.supplier.deleteMany({
        where: { storeId: { in: storeIds } },
      });
    }
    if (otherStoreId) {
      await testPrisma.store.delete({ where: { id: otherStoreId } });
      otherStoreId = undefined;
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

  it("creates a supplier and refuses a duplicate name ignoring case with a Spanish 409", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { POST } = await collectionRoute();
    const params = { storeId: fixture.store.id };

    const created = await POST(
      json("POST", {
        name: " Henko Importaciones ",
        email: " Ventas@Henko.COM ",
        phone: "+57 300 123 4567",
        leadTimeDays: "12",
      }),
      { params },
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body).toMatchObject({
      name: "Henko Importaciones",
      email: "ventas@henko.com",
      phone: "+573001234567",
      leadTimeDays: 12,
      nit: null,
    });
    expect(created.headers.get("cache-control")).toContain("no-store");

    const duplicate = await POST(
      json("POST", { name: "henko IMPORTACIONES" }),
      { params },
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe(
      "Ya existe un proveedor llamado «henko IMPORTACIONES» en esta tienda.",
    );

    // El índice único de la base también responde 409 con el mismo texto
    // si dos peticiones pasan la comprobación previa a la vez.
    const invalid = await POST(json("POST", { name: "K", email: "x@" }), {
      params,
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe(
      "El nombre debe tener al menos 2 caracteres",
    );

    // El mismo nombre en otra tienda sí se permite.
    const otherStore = await testPrisma.store.create({
      data: { name: `Otra tienda ${randomUUID()}`, userId: `other-${randomUUID()}` },
    });
    otherStoreId = otherStore.id;
    const other = await testPrisma.supplier.create({
      data: { storeId: otherStore.id, name: "Henko Importaciones" },
    });
    expect(other.id).toBeTruthy();
  });

  it("refuses to update a supplier to a name another one already uses", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const [first, second] = await Promise.all([
      testPrisma.supplier.create({
        data: { storeId: fixture.store.id, name: "Henko" },
      }),
      testPrisma.supplier.create({
        data: { storeId: fixture.store.id, name: "Kawaii Co" },
      }),
    ]);
    const { PATCH } = await detailRoute();

    const clash = await PATCH(json("PATCH", { name: "HENKO " }), {
      params: { storeId: fixture.store.id, supplierId: second.id },
    });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe(
      "Ya existe un proveedor llamado «HENKO» en esta tienda.",
    );

    // Cambiar solo las mayúsculas del propio nombre no choca consigo mismo.
    const same = await PATCH(
      json("PATCH", { name: "HENKO", nit: "900.1", contactName: "Laura" }),
      { params: { storeId: fixture.store.id, supplierId: first.id } },
    );
    expect(same.status).toBe(200);
    expect(await same.json()).toMatchObject({
      name: "HENKO",
      nit: "900.1",
      contactName: "Laura",
    });

    const foreign = await PATCH(json("PATCH", { name: "Nadie" }), {
      params: { storeId: fixture.store.id, supplierId: randomUUID() },
    });
    expect(foreign.status).toBe(404);
  });

  it("refuses to delete a supplier referenced by products or restock orders, naming both counts", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const supplier = await testPrisma.supplier.create({
      data: { storeId: fixture.store.id, name: "Henko" },
    });
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { supplierId: supplier.id },
    });
    await testPrisma.restockOrder.create({
      data: {
        storeId: fixture.store.id,
        supplierId: supplier.id,
        orderNumber: `PO-${randomUUID().slice(0, 8)}`,
        status: RestockOrderStatus.COMPLETED,
        totalAmount: 50000,
      },
    });
    const { DELETE } = await detailRoute();

    const blocked = await DELETE(json("DELETE"), {
      params: { storeId: fixture.store.id, supplierId: supplier.id },
    });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toBe(
      "No se puede eliminar: 1 producto y 1 pedido de aprovisionamiento lo referencian. Reasigna los productos y conserva los pedidos como historial.",
    );
    expect(
      await testPrisma.supplier.findUnique({ where: { id: supplier.id } }),
    ).not.toBeNull();

    // Sin productos pero con el pedido como historial: sigue bloqueado.
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { supplierId: null },
    });
    const stillBlocked = await DELETE(json("DELETE"), {
      params: { storeId: fixture.store.id, supplierId: supplier.id },
    });
    expect(stillBlocked.status).toBe(409);
    expect((await stillBlocked.json()).error).toContain(
      "1 pedido de aprovisionamiento lo referencia.",
    );

    // La eliminación en lote aplica la misma guarda.
    const { DELETE: bulkDelete } = await collectionRoute();
    const bulk = await bulkDelete(json("DELETE", { ids: [supplier.id] }), {
      params: { storeId: fixture.store.id },
    });
    expect(bulk.status).toBe(409);

    // Sin referencias sí se elimina.
    await testPrisma.restockOrder.deleteMany({
      where: { supplierId: supplier.id },
    });
    const deleted = await DELETE(json("DELETE"), {
      params: { storeId: fixture.store.id, supplierId: supplier.id },
    });
    expect(deleted.status).toBe(200);
    expect(
      await testPrisma.supplier.findUnique({ where: { id: supplier.id } }),
    ).toBeNull();
  });

  it("returns counts, recent orders and open orders on GET, and the loaders ignore other stores", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const supplier = await testPrisma.supplier.create({
      data: { storeId: fixture.store.id, name: "Henko" },
    });
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { supplierId: supplier.id },
    });
    const suffix = randomUUID().slice(0, 8);
    const draft = await testPrisma.restockOrder.create({
      data: {
        storeId: fixture.store.id,
        supplierId: supplier.id,
        orderNumber: `PO-${suffix}-A`,
        status: RestockOrderStatus.DRAFT,
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
    });
    const receiving = await testPrisma.restockOrder.create({
      data: {
        storeId: fixture.store.id,
        supplierId: supplier.id,
        orderNumber: `PO-${suffix}-B`,
        status: RestockOrderStatus.PARTIALLY_RECEIVED,
        totalAmount: 80000,
        createdAt: new Date("2026-02-01T12:00:00Z"),
      },
    });
    // Un borrador posterior no cuenta como compra.
    await testPrisma.restockOrder.create({
      data: {
        storeId: fixture.store.id,
        supplierId: supplier.id,
        orderNumber: `PO-${suffix}-C`,
        status: RestockOrderStatus.DRAFT,
        createdAt: new Date("2026-03-01T12:00:00Z"),
      },
    });

    const { GET } = await detailRoute();
    const response = await GET(json("GET"), {
      params: { storeId: fixture.store.id, supplierId: supplier.id },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body._count).toEqual({ products: 1, restockOrders: 3 });
    expect(body.openRestockOrders).toBe(1);
    expect(body.recentRestockOrders.map((order: { id: string }) => order.id)).toEqual(
      expect.arrayContaining([draft.id, receiving.id]),
    );
    expect(body.recentRestockOrders).toHaveLength(3);

    const { getSupplier } = await loader();
    const detail = await getSupplier(fixture.store.id, supplier.id);
    expect(detail?.usage).toEqual({
      products: 1,
      restockOrders: 3,
      orderedRestockOrders: 0,
      receivingRestockOrders: 1,
      lastPurchaseAt: receiving.createdAt,
    });
    expect(detail?.recentRestockOrders).toHaveLength(3);

    const otherStore = await testPrisma.store.create({
      data: { name: `Otra tienda ${randomUUID()}`, userId: `other-${randomUUID()}` },
    });
    otherStoreId = otherStore.id;
    expect(await getSupplier(otherStore.id, supplier.id)).toBeNull();

    const foreignGet = await GET(json("GET"), {
      params: { storeId: otherStore.id, supplierId: supplier.id },
    });
    // La dueña de la tienda del fixture no es dueña de la otra tienda.
    expect(foreignGet.status).toBe(403);

    const { getSuppliers } = await listLoader();
    const rows = await getSuppliers(fixture.store.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: supplier.id,
      products: 1,
      usage: { products: 1, restockOrders: 3, receivingRestockOrders: 1, lastPurchaseAt: receiving.createdAt },
    });
    expect(await getSuppliers(otherStore.id)).toEqual([]);
  });

  it("rejects anonymous and non-owner callers", async () => {
    fixture = await createInventoryFixture();
    const { GET, POST } = await collectionRoute();
    const params = { storeId: fixture.store.id };

    session.userId = null;
    expect((await GET(json("GET"), { params })).status).toBe(401);

    session.userId = `intruder-${randomUUID()}`;
    expect((await GET(json("GET"), { params })).status).toBe(403);
    expect((await POST(json("POST", { name: "Henko" }), { params })).status).toBe(403);
  });
});
