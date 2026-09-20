import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Importación masiva de CSV: entra mercancía igual que una recepción de
 * aprovisionamiento, así que tiene que dejar el mismo rastro — envío repartido
 * en el costo de cada producto, movimiento con el costo puesto en bodega y una
 * fila de recepción con lo que llegó.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

const batchRoute = () => import("@/app/api/[storeId]/products/batch/route");

const json = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const product = (name: string, stock: number, acqPrice: number) => ({
  name,
  description: "",
  price: acqPrice * 2,
  acqPrice,
  sku: "",
  categoryName: "Agendas",
  sizeName: "Pequeño",
  colorName: "Rosa",
  designName: "Kawaii",
  stock,
  images: [] as string[],
});

describe("importación masiva de productos", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      const storeId = fixture.store.id;
      await testPrisma.restockOrderReceipt.deleteMany({ where: { storeId } });
      const orders = await testPrisma.restockOrder.findMany({ where: { storeId }, select: { id: true } });
      await testPrisma.restockOrderItem.deleteMany({ where: { restockOrderId: { in: orders.map((order) => order.id) } } });
      await testPrisma.restockOrder.deleteMany({ where: { storeId } });
      const imported = await testPrisma.product.findMany({
        where: { storeId, id: { notIn: [fixture.component.id, fixture.kit.id] } },
        select: { id: true },
      });
      const importedIds = imported.map((row) => row.id);
      if (importedIds.length > 0) {
        await testPrisma.inventoryMovement.deleteMany({ where: { productId: { in: importedIds } } });
        await testPrisma.image.deleteMany({ where: { productId: { in: importedIds } } });
        await testPrisma.product.deleteMany({ where: { id: { in: importedIds } } });
      }
      await testPrisma.product.updateMany({ where: { storeId }, data: { supplierId: null } });
      await testPrisma.supplier.deleteMany({ where: { storeId } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const setup = async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const supplier = await testPrisma.supplier.create({ data: { storeId: fixture.store.id, name: `Proveedor ${randomUUID()}` } });
    return { f: fixture, supplierId: supplier.id };
  };

  it("reparte el envío en el costo y deja la misma huella que una recepción", async () => {
    const { f, supplierId } = await setup();
    const { POST } = await batchRoute();

    // 10 × 1.000 + 5 × 4.000 = 30.000 de mercancía, 3.000 de envío → 10 %.
    const response = await POST(
      json({
        supplierId,
        shippingCost: 3000,
        products: [product("Cuaderno importado", 10, 1000), product("Lápiz importado", 5, 4000)],
      }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.successCount).toBe(2);

    const order = await testPrisma.restockOrder.findUniqueOrThrow({ where: { id: body.restockOrderId } });
    expect(order.totalAmount).toBe(30000);
    expect(order.shippingCost).toBe(3000);

    const cuaderno = await testPrisma.product.findFirstOrThrow({ where: { storeId: f.store.id, name: "Cuaderno importado" } });
    const lapiz = await testPrisma.product.findFirstOrThrow({ where: { storeId: f.store.id, name: "Lápiz importado" } });
    expect(cuaderno.acqPrice).toBe(1000);
    expect(cuaderno.transportationCost).toBe(100);
    expect(lapiz.acqPrice).toBe(4000);
    expect(lapiz.transportationCost).toBe(400);

    // El movimiento guarda el costo puesto en bodega, como en la recepción.
    const movements = await testPrisma.inventoryMovement.findMany({ where: { referenceId: order.id, type: "RESTOCK_RECEIVED" } });
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.cost ?? 0).sort((a, b) => a - b)).toEqual([1100, 4400]);

    const receipt = await testPrisma.restockOrderReceipt.findFirstOrThrow({ where: { restockOrderId: order.id } });
    expect(receipt.receivedUnits).toBe(15);
    expect(receipt.lineCount).toBe(2);
    expect(receipt.excessUnits).toBe(0);
    expect(Array.isArray(receipt.lines)).toBe(true);
  });

  it("sin proveedor no inventa un pedido ni reparte envío", async () => {
    const { f } = await setup();
    const { POST } = await batchRoute();

    const response = await POST(
      json({ shippingCost: 5000, products: [product("Borrador importado", 4, 2000)] }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.restockOrderId).toBeNull();
    expect(await testPrisma.restockOrder.count({ where: { storeId: f.store.id } })).toBe(0);

    const borrador = await testPrisma.product.findFirstOrThrow({ where: { storeId: f.store.id, name: "Borrador importado" } });
    expect(borrador.transportationCost).toBe(0);
    const movement = await testPrisma.inventoryMovement.findFirstOrThrow({ where: { productId: borrador.id } });
    expect(movement.type).toBe("INITIAL_MIGRATION");
    expect(movement.cost).toBe(2000);
  });
});
