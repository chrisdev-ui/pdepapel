/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

import { getInventoryMovements, MOVEMENTS_ALL_TAKE, MOVEMENTS_WINDOW_DAYS, MOVEMENTS_WINDOW_TAKE } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/server/get-movements";

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * El kardex de producción supera los 3.000 movimientos: la lista por defecto
 * se acota a una ventana reciente, pero un enlace «Ver movimientos» desde una
 * orden de aprovisionamiento o una feria antigua debe seguir mostrando sus filas.
 */
describe("inventory movements loader with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  const now = new Date("2026-09-12T15:00:00.000Z");

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

  const seed = async (rows: { createdAt: Date; referenceId?: string; createdBy?: string }[]) => {
    const current = fixture!;
    await testPrisma.inventoryMovement.createMany({
      data: rows.map((row, index) => ({
        storeId: current.store.id,
        productId: current.component.id,
        type: "MANUAL_ADJUSTMENT",
        quantity: 1,
        previousStock: index,
        newStock: index + 1,
        reason: "prueba",
        referenceId: row.referenceId ?? null,
        createdAt: row.createdAt,
        createdBy: row.createdBy ?? "SYSTEM",
      })),
    });
  };

  it("returns every movement of a reference even when it is older than the default window", async () => {
    fixture = await createInventoryFixture();
    const referenceId = `restock-${fixture.store.id}`;
    await seed([
      { createdAt: daysAgo(now, 400), referenceId },
      { createdAt: daysAgo(now, 200), referenceId },
      { createdAt: daysAgo(now, 2), referenceId: "otra-referencia" },
      { createdAt: daysAgo(now, 1) },
    ]);

    const result = await getInventoryMovements(fixture.store.id, { referenceId, now });

    expect(result.movements).toHaveLength(2);
    expect(result.movements.every((movement) => movement.referenceId === referenceId)).toBe(true);
    expect(result.windowDays).toBeNull();
    expect(result.hasMore).toBe(false);
    expect(result.take).toBeUndefined();
    expect(result.movements[0].productName).toBe(fixture.component.name);
    expect(result.movements[0].userName).toBe("Sistema");
  });

  it("bounds the default list to the last 90 days and flags when the cap trimmed it", async () => {
    fixture = await createInventoryFixture();
    await seed([
      { createdAt: daysAgo(now, MOVEMENTS_WINDOW_DAYS + 5) },
      { createdAt: daysAgo(now, MOVEMENTS_WINDOW_DAYS - 1) },
      { createdAt: daysAgo(now, 10) },
      { createdAt: daysAgo(now, 0) },
    ]);

    const windowed = await getInventoryMovements(fixture.store.id, { now });
    expect(windowed.windowDays).toBe(MOVEMENTS_WINDOW_DAYS);
    expect(windowed.take).toBe(MOVEMENTS_WINDOW_TAKE);
    expect(windowed.movements).toHaveLength(3);
    expect(windowed.movements.map((movement) => movement.createdAt.getTime())).toEqual(
      [daysAgo(now, 0), daysAgo(now, 10), daysAgo(now, MOVEMENTS_WINDOW_DAYS - 1)].map((date) => date.getTime()),
    );
    expect(windowed.hasMore).toBe(false);

    const capped = await getInventoryMovements(fixture.store.id, { now, take: 2 });
    expect(capped.movements).toHaveLength(2);
    expect(capped.hasMore).toBe(true);
    expect(capped.take).toBe(2);
  });

  it("lifts the window for the full history but keeps the hard cap", async () => {
    fixture = await createInventoryFixture();
    await seed([
      { createdAt: daysAgo(now, 500) },
      { createdAt: daysAgo(now, 120) },
      { createdAt: daysAgo(now, 3) },
    ]);

    const all = await getInventoryMovements(fixture.store.id, { now, sinceDays: null });
    expect(all.windowDays).toBeNull();
    expect(all.take).toBe(MOVEMENTS_ALL_TAKE);
    expect(all.movements).toHaveLength(3);
    expect(all.hasMore).toBe(false);

    const cappedAll = await getInventoryMovements(fixture.store.id, { now, sinceDays: null, take: 1 });
    expect(cappedAll.movements).toHaveLength(1);
    expect(cappedAll.movements[0].createdAt.getTime()).toBe(daysAgo(now, 3).getTime());
    expect(cappedAll.hasMore).toBe(true);
  });

  it("filters by product and stays scoped to the store", async () => {
    fixture = await createInventoryFixture();
    await seed([{ createdAt: daysAgo(now, 1) }, { createdAt: daysAgo(now, 2) }]);
    await testPrisma.inventoryMovement.create({
      data: { storeId: fixture.store.id, productId: fixture.kit.id, type: "MANUAL_ADJUSTMENT", quantity: 1, previousStock: 0, newStock: 1, createdAt: daysAgo(now, 1), createdBy: "SYSTEM" },
    });

    const byProduct = await getInventoryMovements(fixture.store.id, { now, productId: fixture.component.id });
    expect(byProduct.movements).toHaveLength(2);
    expect(byProduct.movements.every((movement) => movement.productId === fixture!.component.id)).toBe(true);

    const otherStore = await getInventoryMovements("otra-tienda", { now });
    expect(otherStore.movements).toHaveLength(0);
  });
});
