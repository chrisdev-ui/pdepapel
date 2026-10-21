import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { applyGroupCoverBackfill, BACKFILL_GROUP_SELECT, planGroupCoverBackfill, undoStatements, type BackfillGroup } from "@/lib/group-cover-backfill";
import { GROUP_ONLY_SCOPE } from "@/lib/variant-images";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El respaldo de `scripts/backfill-group-main-only.ts` contra la base local:
 * la escritura, las líneas DESHACER que anota en `ops/prod-writes.log` y que
 * una segunda pasada no encuentra nada.
 */
let f: InventoryFixture | undefined;
let groupId: string | undefined;

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second));

async function seed() {
  f = await createInventoryFixture();
  const group = await testPrisma.productGroup.create({ data: { name: "Grupo respaldo", description: "x", storeId: f.store.id } });
  groupId = group.id;
  await testPrisma.image.createMany({
    data: [
      { productGroupId: group.id, url: "https://x/portada.jpg", isMain: true, scope: "all" },
      { productGroupId: group.id, url: "https://x/g1.jpg", isMain: false, scope: "all" },
    ],
  });
  const [withOwn, onlyCover] = [f.component.id, f.kit.id];
  await testPrisma.product.updateMany({ where: { id: { in: [withOwn, onlyCover] } }, data: { productGroupId: group.id } });
  await testPrisma.image.createMany({
    data: [
      { productId: withOwn, url: "https://x/portada.jpg", isMain: true, origin: "GROUP_COPY", createdAt: at(1) },
      { productId: withOwn, url: "https://x/portada.jpg", isMain: false, origin: "OWN", createdAt: at(2), brokenAt: at(30) },
      { productId: withOwn, url: "https://x/propia.jpg", isMain: false, origin: "OWN", createdAt: at(3) },
      { productId: withOwn, url: "https://x/g1.jpg", isMain: false, origin: "GROUP_COPY", createdAt: at(4) },
      { productId: onlyCover, url: "https://x/portada.jpg", isMain: true, origin: "GROUP_COPY", createdAt: at(1) },
    ],
  });
  return { withOwn, onlyCover };
}

async function load() {
  return (await testPrisma.productGroup.findMany({ where: { id: groupId }, select: BACKFILL_GROUP_SELECT })) as BackfillGroup[];
}

async function snapshot() {
  const rows = await testPrisma.image.findMany({
    where: { OR: [{ productGroupId: groupId }, { productId: { in: [f!.component.id, f!.kit.id] } }] },
    select: { id: true, productId: true, productGroupId: true, url: true, isMain: true, scope: true, origin: true, brokenAt: true, createdAt: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  return rows;
}

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (groupId) {
    await testPrisma.image.deleteMany({ where: { OR: [{ productGroupId: groupId }, { productId: { in: [f!.component.id, f!.kit.id] } }] } });
    await testPrisma.product.updateMany({ where: { productGroupId: groupId }, data: { productGroupId: null } });
    await testPrisma.productGroup.delete({ where: { id: groupId } });
  }
  if (f) await deleteInventoryFixture(f);
  f = undefined;
  groupId = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("respaldo «portada solo del grupo»", () => {
  it("limpia la variante con otras fotos, deja la de solo portada y marca la portada", async () => {
    const { withOwn, onlyCover } = await seed();
    const plan = planGroupCoverBackfill(await load());

    const rows = await testPrisma.$transaction((tx) => applyGroupCoverBackfill(tx, plan));

    expect(rows).toBe(1 + 2 + 1);
    const after = await snapshot();
    expect(after.filter((row) => row.productId === withOwn).map((row) => [row.url, row.isMain])).toEqual(
      expect.arrayContaining([
        ["https://x/propia.jpg", true],
        ["https://x/g1.jpg", false],
      ]),
    );
    expect(after.filter((row) => row.productId === withOwn)).toHaveLength(2);
    expect(after.filter((row) => row.productId === onlyCover).map((row) => [row.url, row.isMain])).toEqual([["https://x/portada.jpg", true]]);
    expect(after.find((row) => row.productGroupId && row.isMain)?.scope).toBe(GROUP_ONLY_SCOPE);
    expect(plan.skipped.map((item) => item.productId)).toEqual([onlyCover]);

    expect(planGroupCoverBackfill(await load())).toMatchObject({ scopeUpdates: [], deletions: [], coverChanges: [] });
  });

  it("las líneas DESHACER devuelven todo a como estaba", async () => {
    await seed();
    const before = await snapshot();
    const plan = planGroupCoverBackfill(await load());
    await testPrisma.$transaction((tx) => applyGroupCoverBackfill(tx, plan));

    for (const statement of undoStatements(plan)) await testPrisma.$executeRawUnsafe(statement);

    const restored = await snapshot();
    const withoutUpdatedAt = (rows: typeof before) => rows.map(({ updatedAt: _updatedAt, ...row }) => row);
    expect(withoutUpdatedAt(restored)).toEqual(withoutUpdatedAt(before));
    const reinserted = new Set(plan.deletions.map((row) => row.id));
    expect(restored.filter((row) => reinserted.has(row.id))).toEqual(before.filter((row) => reinserted.has(row.id)));
  });
});
