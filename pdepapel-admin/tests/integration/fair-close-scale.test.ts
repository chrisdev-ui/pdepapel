import {
  allocateFairInventory,
  createFairSale,
  openFairEvent,
  reconcileFairEvent,
  startFairReconciliation,
} from "@/lib/fair-events";
import { FairEventStatus, PaymentMethod } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/** Consultas atendidas por el servidor MySQL de pruebas (solo corre esta suite). */
async function serverQuestions(): Promise<number> {
  const rows = await testPrisma.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>(
    "SHOW GLOBAL STATUS LIKE 'Questions'",
  );
  return Number(rows[0]?.Value ?? 0);
}

describe("cierre de feria a escala y en carrera (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("closes an 80-row fair in a handful of queries, returning every counted unit", async () => {
    fixture = await createInventoryFixture();
    const f = fixture;
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } });
    const products = [];
    for (let i = 0; i < 80; i += 1) {
      products.push(
        await testPrisma.product.create({
          data: {
            name: `Producto ${String(i).padStart(2, "0")}`,
            slug: `${base.slug}-p${i}`,
            description: "escala",
            stock: 10,
            price: 1000 + i,
            acqPrice: 400,
            sku: `${base.sku}-P${i}`,
            storeId: f.store.id,
            categoryId: base.categoryId,
            colorId: base.colorId,
            sizeId: base.sizeId,
            designId: base.designId,
          },
        }),
      );
    }
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: f.store.id, name: "Feria grande", createdBy: f.store.userId },
    });
    await allocateFairInventory({
      storeId: f.store.id,
      fairEventId: fairEvent.id,
      allocations: products.map((product, i) => ({ productId: product.id, quantity: 1 + (i % 3) })),
      userId: f.store.userId,
    });
    await openFairEvent({ storeId: f.store.id, fairEventId: fairEvent.id });
    await startFairReconciliation({ storeId: f.store.id, fairEventId: fairEvent.id });

    const before = await serverQuestions();
    const closed = await reconcileFairEvent({
      storeId: f.store.id,
      fairEventId: fairEvent.id,
      items: products.map((product, i) => ({
        productId: product.id,
        returnedQuantity: 1 + (i % 3) - (i % 2),
        damagedQuantity: i % 2,
        lostQuantity: 0,
      })),
      userId: f.store.userId,
    });
    const queries = (await serverQuestions()) - before - 1;
    expect(closed).toMatchObject({ status: FairEventStatus.CLOSED, inventoryIssues: 0 });
    // Antes eran ~5 consultas por unidad devuelta más una por fila (~450 en
    // una feria de 76 filas); ahora el cierre entero cabe en unas decenas.
    expect(queries).toBeLessThan(60);

    const returned = await testPrisma.inventoryMovement.findMany({
      where: { referenceId: fairEvent.id, type: "FESTIVAL_RETURN" },
    });
    expect(returned).toHaveLength(products.filter((_, i) => 1 + (i % 3) - (i % 2) > 0).length);
    // Una sola lectura de los 80 productos; se comprueba cada uno desde el mapa.
    const stocks = new Map(
      (
        await testPrisma.product.findMany({
          where: { id: { in: products.map((product) => product.id) } },
          select: { id: true, stock: true },
        })
      ).map((product) => [product.id, product.stock]),
    );
    products.forEach((product, i) => {
      // 10 reservadas − (1 + i%3) + devueltas; lo dañado no vuelve.
      expect(stocks.get(product.id)).toBe(10 - (1 + (i % 3)) + (1 + (i % 3) - (i % 2)));
    });
    const rows = await testPrisma.fairEventInventoryItem.findMany({ where: { fairEventId: fairEvent.id } });
    expect(rows.every((row) => row.returnedQuantity + row.damagedQuantity === row.allocatedQuantity)).toBe(true);
  });

  it("handles a late sale and a close racing on the same fair without an unhandled error", async () => {
    fixture = await createInventoryFixture();
    const f = fixture;
    const fairEvent = await testPrisma.fairEvent.create({
      data: { storeId: f.store.id, name: "Feria en carrera", createdBy: f.store.userId },
    });
    await allocateFairInventory({
      storeId: f.store.id,
      fairEventId: fairEvent.id,
      allocations: [{ productId: f.component.id, quantity: 4 }],
      userId: f.store.userId,
    });
    await openFairEvent({ storeId: f.store.id, fairEventId: fairEvent.id });
    await startFairReconciliation({ storeId: f.store.id, fairEventId: fairEvent.id });

    const settle = <T,>(promise: Promise<T>) =>
      promise.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    const [sale, close] = await Promise.all([
      settle(
        createFairSale({
          storeId: f.store.id,
          fairEventId: fairEvent.id,
          items: [{ productId: f.component.id, quantity: 1 }],
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: "fair-race-late-sale-0001",
          userId: f.store.userId,
        }),
      ),
      settle(
        reconcileFairEvent({
          storeId: f.store.id,
          fairEventId: fairEvent.id,
          items: [{ productId: f.component.id, returnedQuantity: 4, damagedQuantity: 0, lostQuantity: 0 }],
          userId: f.store.userId,
        }),
      ),
    ]);
    const handled = (outcome: { ok: boolean; error?: unknown }) => {
      if (outcome.ok) return true;
      const error = outcome.error as { statusCode?: number; code?: string };
      // Un error tipado (400 conteo desfasado / 409 feria cerrada o venta
      // cruzada) o el conflicto de serialización que la ruta convierte en 409.
      return [400, 409].includes(error.statusCode ?? 0) || error.code === "P2034";
    };
    expect(handled(sale)).toBe(true);
    expect(handled(close)).toBe(true);
    // Los dos no pueden haber ganado: si la venta entró, el cierre con 4
    // devueltas ya no cuadra; si el cierre entró primero, la venta se rechaza.
    expect(sale.ok && close.ok).toBe(false);
    const row = await testPrisma.fairEventInventoryItem.findFirstOrThrow({
      where: { fairEventId: fairEvent.id, productId: f.component.id },
    });
    const fair = await testPrisma.fairEvent.findUniqueOrThrow({ where: { id: fairEvent.id } });
    if (close.ok) {
      expect(fair.status).toBe(FairEventStatus.CLOSED);
      expect(row).toMatchObject({ soldQuantity: 0, returnedQuantity: 4 });
    } else {
      expect(fair.status).toBe(FairEventStatus.RECONCILING);
      expect(row).toMatchObject({ soldQuantity: sale.ok ? 1 : 0, returnedQuantity: 0 });
    }
  });
});
