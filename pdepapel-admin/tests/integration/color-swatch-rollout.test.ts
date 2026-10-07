import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { COLOR_SWATCH_BACKFILL } from "../../scripts/lib/color-swatch-backfill.mjs";
import {
  applyColorRollout,
  planColorRollout,
  rollbackSql,
  type RolloutInput,
} from "../../scripts/lib/color-swatch-rollout";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Paso «c» del bloque D (issue #3): backfill de `swatchType`, dos hex y unir
 * «Neón» en «Fluorescente», todo o nada. Cada precondición rota tiene que
 * dejar la base intacta; una segunda corrida es una negativa; y el SQL que
 * se anota para deshacer devuelve cada fila exactamente a como estaba.
 */
describe("color swatch rollout with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Los 13 colores del mapa en SOLID (más «Rosa» del fixture), 2 productos en «Neón» y 2 activos + 1 archivado en «Fluorescente». */
  async function seed() {
    fixture = await createInventoryFixture();
    const storeId = fixture.store.id;
    const values: Record<string, string> = { "Azul fluorescente": "#2b5b99", "Morado fluorescente": "#9f598f" };
    const colors = new Map<string, string>();
    for (const name of Object.keys(COLOR_SWATCH_BACKFILL)) {
      const color = await testPrisma.color.create({ data: { storeId, name, value: values[name] ?? "#ffffff" } });
      colors.set(name, color.id);
    }
    const base = fixture.component;
    const product = (name: string, colorId: string, isArchived = false) =>
      testPrisma.product.create({
        data: {
          name,
          description: "Producto de pruebas",
          slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}`,
          sku: `ROLL-${randomUUID()}`,
          price: 1000,
          acqPrice: 500,
          stock: 1,
          isArchived,
          storeId,
          categoryId: base.categoryId,
          sizeId: base.sizeId,
          designId: base.designId,
          colorId,
        },
      });
    const neonProducts = [
      await product("Block iris Neón", colors.get("Neón")!),
      await product("Resaltadores neón x4", colors.get("Neón")!),
    ];
    await product("Escarcha neón", colors.get("Fluorescente")!);
    await product("Notas neón", colors.get("Fluorescente")!);
    await product("Banderitas neón", colors.get("Fluorescente")!, true);

    const input: RolloutInput = {
      storeId,
      newBlueHex: "#1E90FF",
      newPurpleHex: "#D946EF",
      expect: {
        colorCount: Object.keys(COLOR_SWATCH_BACKFILL).length + 1,
        blueHex: "#2b5b99",
        purpleHex: "#9f598f",
        neonProductIds: neonProducts.map((row) => row.id),
        fluorescentActiveProducts: 2,
      },
    };
    return { storeId, colors, neonProducts, input };
  }

  /** Todo lo que el guion puede tocar, para comparar antes y después. */
  async function snapshot(storeId: string) {
    const [colors, products] = await Promise.all([
      testPrisma.color.findMany({
        where: { storeId },
        select: { id: true, name: true, value: true, swatchType: true, isArchived: true, archivedAt: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      testPrisma.product.findMany({ where: { storeId }, select: { id: true, colorId: true, updatedAt: true }, orderBy: { id: "asc" } }),
    ]);
    return { colors, products };
  }

  const run = (input: RolloutInput) => testPrisma.$transaction((tx) => applyColorRollout(tx, input), { timeout: 30_000 });

  it("applies the backfill, both hex values and the merge in one transaction", async () => {
    const { storeId, colors, neonProducts, input } = await seed();

    const plan = await planColorRollout(testPrisma, input);
    expect(plan.problems).toEqual([]);
    expect(plan.changes.swatchTypes).toHaveLength(13);

    const result = await run(input);
    expect(result).toEqual({ swatchTypes: 13, hex: 2, moved: 2, archived: 1 });

    const after = await testPrisma.color.findMany({ where: { storeId }, select: { name: true, value: true, swatchType: true, isArchived: true } });
    const byName = new Map(after.map((row) => [row.name, row]));
    for (const [name, type] of Object.entries(COLOR_SWATCH_BACKFILL)) expect(byName.get(name)?.swatchType, name).toBe(type);
    expect(byName.get("Pastel")?.swatchType).toBe("MULTICOLOR_PASTEL");
    expect(byName.get("Rosa")?.swatchType).toBe("SOLID");
    expect(byName.get("Azul fluorescente")?.value).toBe("#1E90FF");
    expect(byName.get("Morado fluorescente")?.value).toBe("#D946EF");
    expect(byName.get("Neón")?.isArchived).toBe(true);
    expect(byName.get("Fluorescente")?.isArchived).toBe(false);

    const moved = await testPrisma.product.findMany({ where: { id: { in: neonProducts.map((row) => row.id) } }, select: { colorId: true } });
    expect(moved.every((row) => row.colorId === colors.get("Fluorescente"))).toBe(true);
    expect(await testPrisma.product.count({ where: { storeId, colorId: colors.get("Fluorescente"), isArchived: false } })).toBe(4);
  });

  const preconditionCases: [string, (ctx: Awaited<ReturnType<typeof seed>>) => Promise<unknown>, RegExp][] = [
    [
      "a color that is no longer SOLID",
      ({ colors }) => testPrisma.color.update({ where: { id: colors.get("Dorado")! }, data: { swatchType: "METALLIC" } }),
      /no todos los colores están en SOLID: Dorado=METALLIC/,
    ],
    [
      "a fluorescent hex that changed",
      ({ colors }) => testPrisma.color.update({ where: { id: colors.get("Azul fluorescente")! }, data: { value: "#000000" } }),
      /«Azul fluorescente» tiene #000000, no #2b5b99/,
    ],
    [
      "«Neón» already archived",
      ({ colors }) => testPrisma.color.update({ where: { id: colors.get("Neón")! }, data: { isArchived: true, archivedAt: new Date() } }),
      /«Neón» ya está archivado/,
    ],
    [
      "«Neón» with an unexpected product",
      ({ storeId, colors }) =>
        testPrisma.product.create({
          data: {
            name: "Intruso",
            description: "Producto de pruebas",
            slug: `intruso-${randomUUID()}`,
            sku: `ROLL-${randomUUID()}`,
            price: 1000,
            stock: 1,
            storeId,
            categoryId: fixture!.component.categoryId,
            sizeId: fixture!.component.sizeId,
            designId: fixture!.component.designId,
            colorId: colors.get("Neón")!,
          },
        }),
      /«Neón» tiene 3 productos/,
    ],
    [
      "«Fluorescente» with a different number of active products",
      ({ storeId, colors }) =>
        testPrisma.product.updateMany({ where: { storeId, colorId: colors.get("Fluorescente")!, isArchived: false, name: "Notas neón" }, data: { isArchived: true } }),
      /«Fluorescente» tiene 1 productos activos, no 2/,
    ],
  ];

  it.each(preconditionCases)("refuses and writes nothing with %s", async (_label, breakIt, message) => {
    const ctx = await seed();
    await breakIt(ctx);
    const before = await snapshot(ctx.storeId);

    const plan = await planColorRollout(testPrisma, ctx.input);
    expect(plan.problems.join("\n")).toMatch(message);
    await expect(run(ctx.input)).rejects.toThrow(/precondiciones rotas, no se escribió nada/);

    expect(await snapshot(ctx.storeId)).toEqual(before);
  });

  it("a second run is a refusal, never a second merge", async () => {
    const { storeId, input } = await seed();
    await run(input);
    const afterFirst = await snapshot(storeId);

    await expect(run(input)).rejects.toThrow(/precondiciones rotas/);
    expect(await snapshot(storeId)).toEqual(afterFirst);
  });

  it("the logged rollback SQL restores every touched row exactly, updatedAt included", async () => {
    const { storeId, input } = await seed();
    const before = await snapshot(storeId);
    const plan = await planColorRollout(testPrisma, input);
    const rollback = rollbackSql(plan.before);
    expect(rollback).toHaveLength(13 + 2);

    await run(input);
    expect(await snapshot(storeId)).not.toEqual(before);

    for (const statement of rollback) await testPrisma.$executeRawUnsafe(statement);
    expect(await snapshot(storeId)).toEqual(before);
  });
});
