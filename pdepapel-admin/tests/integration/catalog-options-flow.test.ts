import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  applyCatalogMigrationSuggestions,
  catalogMigrationPayloadSchema,
  prepareCatalogMigrationSuggestions,
  updateCatalogMigrationAttributes,
} from "@/lib/catalog-migration";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("catalog option migration with MySQL", () => {
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

  it("preserves the internal size while publishing reviewed customer options", async () => {
    fixture = await createInventoryFixture();

    await testPrisma.product.update({
      where: { id: fixture.kit.id },
      data: { isArchived: true },
    });
    await testPrisma.product.update({
      where: { id: fixture.component.id },
      data: { name: "Cuaderno A5 x 80 hojas" },
    });
    await testPrisma.category.update({
      where: { id: fixture.category.id },
      data: { name: "📒 Agendas" },
    });
    await testPrisma.type.update({
      where: { id: fixture.category.typeId },
      data: { name: "✨ Papelería" },
    });

    const productBefore = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
      include: { size: true },
    });

    await expect(
      prepareCatalogMigrationSuggestions({ storeId: fixture.store.id }),
    ).resolves.toEqual({ prepared: 1, scanned: 1 });

    const suggestion =
      await testPrisma.catalogMigrationSuggestion.findFirstOrThrow({
        where: {
          storeId: fixture.store.id,
          productId: fixture.component.id,
        },
      });
    const payload = catalogMigrationPayloadSchema.parse(suggestion.payload);

    expect(payload.shippingProfile.code).toBe(
      productBefore.size.value.toUpperCase(),
    );
    expect(payload.category).toMatchObject({
      canonicalName: "Agendas",
      icon: "📒",
    });
    expect(payload.type).toMatchObject({
      canonicalName: "Papelería",
      icon: "✨",
    });
    expect(payload.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "formato", value: "A5" }),
        expect.objectContaining({ key: "cantidad", value: "80 hojas" }),
      ]),
    );
    expect(payload.attributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: productBefore.size.value }),
      ]),
    );

    await updateCatalogMigrationAttributes({
      storeId: fixture.store.id,
      suggestionId: suggestion.id,
      attributes: [
        ...payload.attributes,
        {
          key: "tipo-superficie",
          name: "Tipo de superficie",
          value: "Lisa",
          confidence: 1,
          evidence: "Confirmado manualmente por la administradora",
        },
      ],
    });

    await expect(
      applyCatalogMigrationSuggestions({
        storeId: fixture.store.id,
        suggestionIds: [suggestion.id],
      }),
    ).resolves.toEqual({ applied: 1, requested: 1 });

    const productAfter = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
      include: {
        size: true,
        shippingProfile: true,
        catalogOptionValues: {
          include: { option: true, optionValue: true },
          orderBy: { option: { key: "asc" } },
        },
        category: { include: { type: true } },
      },
    });

    expect(productAfter.sizeId).toBe(productBefore.sizeId);
    expect(productAfter.size).toMatchObject({
      id: productBefore.size.id,
      value: productBefore.size.value,
    });
    expect(productAfter.shippingProfile).toMatchObject({
      code: productBefore.size.value.toUpperCase(),
    });
    expect(productAfter.category).toMatchObject({
      name: "Agendas",
      icon: "📒",
      type: { name: "Papelería", icon: "✨" },
    });
    expect(productAfter.catalogOptionValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          option: expect.objectContaining({ key: "formato" }),
          optionValue: expect.objectContaining({ name: "A5" }),
        }),
        expect.objectContaining({
          option: expect.objectContaining({ key: "tipo-superficie" }),
          optionValue: expect.objectContaining({ name: "Lisa" }),
        }),
      ]),
    );
    await expect(
      testPrisma.catalogMigrationSuggestion.findUniqueOrThrow({
        where: { id: suggestion.id },
      }),
    ).resolves.toMatchObject({ status: "APPLIED" });
  });
});
