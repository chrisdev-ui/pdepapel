import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { applyZeroTransportFix, zeroTransportPlan } from "@/lib/transportation-zero-fix";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** La corrección del 0 → null por la misma lógica que corre el guion, contra MySQL de pruebas. */
describe("envío en 0 exacto → no registrado", () => {
  let fixture: InventoryFixture | undefined;
  afterEach(async () => {
    if (fixture) {
      await testPrisma.product.deleteMany({ where: { storeId: fixture.store.id, name: { startsWith: "Cero " } } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
  });

  async function seed() {
    fixture = await createInventoryFixture();
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    const make = (name: string, data: { transportationCost: number | null; isArchived?: boolean; isKit?: boolean }) =>
      testPrisma.product.create({
        data: {
          storeId: fixture!.store.id,
          name: `Cero ${name}`,
          slug: `cero-${randomUUID()}`,
          sku: `CERO-${randomUUID().slice(0, 8)}`,
          description: "Producto de la prueba del envío en 0.",
          price: 1000,
          acqPrice: 400,
          stock: 1,
          categoryId: base.categoryId,
          sizeId: base.sizeId,
          colorId: base.colorId,
          designId: base.designId,
          ...data,
        },
      });
    await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { transportationCost: 50 } });
    return {
      zeroA: await make("activo A", { transportationCost: 0 }),
      zeroB: await make("activo B", { transportationCost: 0 }),
      archived: await make("archivado", { transportationCost: 0, isArchived: true }),
      kit: await make("kit", { transportationCost: 0, isKit: true }),
      real: await make("con envío", { transportationCost: 120 }),
      none: await make("sin registrar", { transportationCost: null }),
    };
  }

  const run = <T>(work: (tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0]) => Promise<T>) => testPrisma.$transaction((tx) => work(tx));
  const valueOf = async (id: string) => (await testPrisma.product.findUniqueOrThrow({ where: { id } })).transportationCost;

  it("el ensayo cuenta solo activos que no son kits; kits y archivados aparte y sin tocar", async () => {
    const rows = await seed();
    const plan = await zeroTransportPlan(testPrisma, fixture!.store.id);
    expect(plan.ids.sort()).toEqual([rows.zeroA.id, rows.zeroB.id].sort());
    expect(plan).toMatchObject({ kitsFuera: 1, archivadosFuera: 1 });
  });

  it("con un N distinto no escribe nada; con el N del ensayo escribe null solo en esos, una sola vez", async () => {
    const rows = await seed();
    await expect(applyZeroTransportFix(3, run, fixture!.store.id)).rejects.toThrow("se esperaban 3");
    expect(await valueOf(rows.zeroA.id)).toBe(0);

    const ids = await applyZeroTransportFix(2, run, fixture!.store.id);
    expect(ids.sort()).toEqual([rows.zeroA.id, rows.zeroB.id].sort());
    expect(await valueOf(rows.zeroA.id)).toBeNull();
    expect(await valueOf(rows.zeroB.id)).toBeNull();
    expect(await valueOf(rows.archived.id)).toBe(0);
    expect(await valueOf(rows.kit.id)).toBe(0);
    expect(await valueOf(rows.real.id)).toBe(120);
    expect(await valueOf(rows.none.id)).toBeNull();

    // Repetirla: ya no queda ninguno en 0.
    expect((await zeroTransportPlan(testPrisma, fixture!.store.id)).ids).toEqual([]);
    await expect(applyZeroTransportFix(2, run, fixture!.store.id)).rejects.toThrow("Hay 0 productos");
  });

  it("si un producto deja de estar en 0 entre el ensayo y la escritura, no escribe nada", async () => {
    const rows = await seed();
    const plan = await zeroTransportPlan(testPrisma, fixture!.store.id);
    await testPrisma.product.update({ where: { id: rows.zeroB.id }, data: { transportationCost: 90 } });
    await expect(applyZeroTransportFix(plan.ids.length, run, fixture!.store.id)).rejects.toThrow();
    expect(await valueOf(rows.zeroA.id)).toBe(0);
  });
});
