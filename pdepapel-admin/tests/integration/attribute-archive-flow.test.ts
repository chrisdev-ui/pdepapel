import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ACTIVE_ATTRIBUTE_WHERE, setAttributesArchived } from "@/lib/attribute-archive";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("attribute archive flow with MySQL", () => {
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

  it("archives a color in use without touching its products and hides it from active readers", async () => {
    fixture = await createInventoryFixture();
    const before = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });

    const result = await setAttributesArchived(testPrisma, {
      storeId: fixture.store.id,
      input: { kind: "colors", ids: [before.colorId], archived: true },
    });
    expect(result).toEqual({ count: 1, categorySlugs: [] });

    const color = await testPrisma.color.findUniqueOrThrow({ where: { id: before.colorId } });
    expect(color.isArchived).toBe(true);
    expect(color.archivedAt).toBeInstanceOf(Date);

    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(after.colorId).toBe(before.colorId);
    expect(after.isArchived).toBe(false);

    const activeColors = await testPrisma.color.findMany({
      where: { storeId: fixture.store.id, ...ACTIVE_ATTRIBUTE_WHERE },
    });
    expect(activeColors).toHaveLength(0);

    await setAttributesArchived(testPrisma, {
      storeId: fixture.store.id,
      input: { kind: "colors", ids: [before.colorId], archived: false },
    });
    const restored = await testPrisma.color.findUniqueOrThrow({ where: { id: before.colorId } });
    expect(restored).toMatchObject({ isArchived: false, archivedAt: null });
  });

  it("refuses to archive a subcategory with active products until they are archived, then cascades to the category", async () => {
    fixture = await createInventoryFixture();
    const categoryId = fixture.category.id;

    await expect(
      setAttributesArchived(testPrisma, {
        storeId: fixture.store.id,
        input: { kind: "categories", ids: [categoryId], archived: true },
      }),
    ).rejects.toThrow(/productos activos en «Agendas» \(2\)/);

    const type = await testPrisma.type.findFirstOrThrow({ where: { storeId: fixture.store.id } });
    await expect(
      setAttributesArchived(testPrisma, {
        storeId: fixture.store.id,
        input: { kind: "types", ids: [type.id], archived: true },
      }),
    ).rejects.toThrow(/subcategorías activas/);

    await testPrisma.product.updateMany({ where: { categoryId }, data: { isArchived: true } });

    const result = await setAttributesArchived(testPrisma, {
      storeId: fixture.store.id,
      input: { kind: "categories", ids: [categoryId], archived: true },
    });
    expect(result.count).toBe(1);
    expect(result.categorySlugs).toEqual([fixture.category.slug]);

    const typeResult = await setAttributesArchived(testPrisma, {
      storeId: fixture.store.id,
      input: { kind: "types", ids: [type.id], archived: true },
    });
    expect(typeResult.count).toBe(1);

    const archivedCategory = await testPrisma.category.findUniqueOrThrow({ where: { id: categoryId } });
    expect(archivedCategory.isArchived).toBe(true);
    const publicCategory = await testPrisma.category.findFirst({
      where: { storeId: fixture.store.id, slug: fixture.category.slug, ...ACTIVE_ATTRIBUTE_WHERE },
    });
    expect(publicCategory).toBeNull();
  });

  it("rejects ids that belong to another store", async () => {
    fixture = await createInventoryFixture();
    const size = await testPrisma.size.findFirstOrThrow({ where: { storeId: fixture.store.id } });

    await expect(
      setAttributesArchived(testPrisma, {
        storeId: "another-store",
        input: { kind: "sizes", ids: [size.id], archived: true },
      }),
    ).rejects.toThrow(/no existen en esta tienda/);
    const untouched = await testPrisma.size.findUniqueOrThrow({ where: { id: size.id } });
    expect(untouched.isArchived).toBe(false);
  });
});
