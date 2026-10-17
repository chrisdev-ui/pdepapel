import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { applyZeroTransportFix, zeroTransportPlan } from "@/lib/transportation-zero-fix";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** La corrección del 0 por la misma lógica que corre el guion, contra MySQL de pruebas. Valores de prueba. */
describe("envío en 0 exacto: desde hermana o «no registrado»", () => {
  let fixture: InventoryFixture | undefined;
  afterEach(async () => {
    if (fixture) {
      await testPrisma.product.deleteMany({ where: { storeId: fixture.store.id, name: { startsWith: "Cero " } } });
      await testPrisma.productGroup.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
  });

  async function seed() {
    fixture = await createInventoryFixture();
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { transportationCost: 50 } });
    const group = (name: string) => testPrisma.productGroup.create({ data: { storeId: fixture!.store.id, name: `Cero ${name}`, description: "Grupo de prueba" } });
    const make = (name: string, data: { transportationCost: number | null; productGroupId?: string; isArchived?: boolean; isKit?: boolean }) =>
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
    const [one, conflict, none] = await Promise.all([group("un valor"), group("conflicto"), group("sin valor")]);
    return {
      one,
      // Grupo con un solo valor real entre hermanas activas (un kit y una archivada con otro valor no cuentan).
      inheritA: await make("hereda A", { transportationCost: 0, productGroupId: one.id }),
      inheritB: await make("hereda B", { transportationCost: 0, productGroupId: one.id }),
      oneReal: await make("hermana real", { transportationCost: 120, productGroupId: one.id }),
      oneNull: await make("hermana sin dato", { transportationCost: null, productGroupId: one.id }),
      oneKit: await make("hermana kit", { transportationCost: 999, productGroupId: one.id, isKit: true }),
      oneArchived: await make("hermana archivada", { transportationCost: 777, productGroupId: one.id, isArchived: true }),
      // Hermanas con valores reales distintos: no se adivina.
      conflictZero: await make("en conflicto", { transportationCost: 0, productGroupId: conflict.id }),
      conflictA: await make("hermana 120", { transportationCost: 120, productGroupId: conflict.id }),
      conflictB: await make("hermana 150", { transportationCost: 150, productGroupId: conflict.id }),
      // Sin ningún valor real (el 1.000 heredado no cuenta).
      noneZero: await make("sin valor real", { transportationCost: 0, productGroupId: none.id }),
      noneLegacy: await make("hermana 1000", { transportationCost: 1000, productGroupId: none.id }),
      // Suelto, archivado y kit.
      loose: await make("suelto", { transportationCost: 0 }),
      archived: await make("archivado", { transportationCost: 0, isArchived: true }),
      kit: await make("kit", { transportationCost: 0, isKit: true }),
    };
  }

  const run = <T>(work: (tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0]) => Promise<T>) => testPrisma.$transaction((tx) => work(tx));
  const valueOf = async (id: string) => (await testPrisma.product.findUniqueOrThrow({ where: { id } })).transportationCost;

  it("el ensayo separa «desde hermana» de «a no registrado» y cuenta los conflictos; kits y archivados aparte", async () => {
    const rows = await seed();
    const plan = await zeroTransportPlan(testPrisma, fixture!.store.id);
    expect(plan.fromSibling.sort((a, b) => a.id.localeCompare(b.id))).toEqual([{ id: rows.inheritA.id, value: 120 }, { id: rows.inheritB.id, value: 120 }].sort((a, b) => a.id.localeCompare(b.id)));
    expect(plan.toNull.sort()).toEqual([rows.conflictZero.id, rows.noneZero.id, rows.loose.id].sort());
    expect(plan).toMatchObject({ conflicts: 1, kitsFuera: 1, archivadosFuera: 1 });
  });

  it("aplica el plan revisado una sola vez: hermana → su valor, el resto → null; archivados y kits sin tocar", async () => {
    const rows = await seed();
    const plan = await zeroTransportPlan(testPrisma, fixture!.store.id);
    await expect(applyZeroTransportFix(plan, 4, run, fixture!.store.id)).rejects.toThrow("se esperaban 4");
    expect(await valueOf(rows.inheritA.id)).toBe(0);

    const result = await applyZeroTransportFix(plan, 5, run, fixture!.store.id);
    expect(result).toEqual({ written: 5, fromSibling: 2, toNull: 3 });
    expect(await valueOf(rows.inheritA.id)).toBe(120);
    expect(await valueOf(rows.inheritB.id)).toBe(120);
    for (const row of [rows.conflictZero, rows.noneZero, rows.loose]) expect(await valueOf(row.id)).toBeNull();
    expect(await valueOf(rows.archived.id)).toBe(0);
    expect(await valueOf(rows.kit.id)).toBe(0);
    expect(await valueOf(rows.noneLegacy.id)).toBe(1000);

    const again = await zeroTransportPlan(testPrisma, fixture!.store.id);
    expect(again.fromSibling.length + again.toNull.length).toBe(0);
    await expect(applyZeroTransportFix(plan, 5, run, fixture!.store.id)).rejects.toThrow("cambió desde el ensayo");
  });

  it("si cambia el valor de una hermana o una fila deja de estar en 0 después del ensayo, no escribe nada", async () => {
    const rows = await seed();
    const plan = await zeroTransportPlan(testPrisma, fixture!.store.id);
    await testPrisma.product.update({ where: { id: rows.oneReal.id }, data: { transportationCost: 130 } });
    await expect(applyZeroTransportFix(plan, 5, run, fixture!.store.id)).rejects.toThrow("cambió desde el ensayo");
    expect(await valueOf(rows.inheritA.id)).toBe(0);
    expect(await valueOf(rows.loose.id)).toBe(0);

    const fresh = await zeroTransportPlan(testPrisma, fixture!.store.id);
    await testPrisma.product.update({ where: { id: rows.loose.id }, data: { transportationCost: 90 } });
    await expect(applyZeroTransportFix(fresh, 5, run, fixture!.store.id)).rejects.toThrow();
    expect(await valueOf(rows.inheritA.id)).toBe(0);
  });
});
