import { describe, expect, it } from "vitest";

import {
  attributeMergeMessage,
  collisionMessage,
  findVariantCollisions,
  parseAttributeMergeBody,
  parseMoveCategoriesBody,
  type AttributeMergePreview,
} from "@/lib/attribute-merge";

describe("parseAttributeMergeBody", () => {
  it("accepts the four mergeable kinds, dedupes sources and drops the target from them", () => {
    expect(parseAttributeMergeBody({ kind: "colors", sourceIds: ["a", "b", "a", "t", ""], targetId: "t", dryRun: true })).toEqual({
      kind: "colors",
      sourceIds: ["a", "b"],
      targetId: "t",
      dryRun: true,
    });
    expect(parseAttributeMergeBody({ kind: "categories", sourceIds: ["a"], targetId: "t" }).dryRun).toBe(false);
  });

  it("rejects categories (types), a missing target, an empty or oversized source list", () => {
    expect(() => parseAttributeMergeBody({ kind: "types", sourceIds: ["a"], targetId: "t" })).toThrow(/Solo se pueden unir/);
    expect(() => parseAttributeMergeBody({ kind: "sizes", sourceIds: ["a"] })).toThrow(/que se queda/);
    expect(() => parseAttributeMergeBody({ kind: "sizes", sourceIds: ["t"], targetId: "t" })).toThrow(/distinto del que se queda/);
    expect(() =>
      parseAttributeMergeBody({ kind: "sizes", sourceIds: Array.from({ length: 51 }, (_, i) => `s${i}`), targetId: "t" }),
    ).toThrow(/50/);
  });
});

describe("findVariantCollisions", () => {
  const variant = (id: string, group: string | null, sizeId: string, colorId: string, designId: string) => ({
    id,
    name: `Variante ${id}`,
    productGroupId: group,
    sizeId,
    colorId,
    designId,
  });

  it("finds the group where two variants would share a combination after the merge", () => {
    const variants = [
      variant("v1", "g1", "S", "rosado", "osito"),
      variant("v2", "g1", "S", "rosa-pastel", "osito"),
      variant("v3", "g1", "M", "rosa-pastel", "osito"),
      variant("v4", "g2", "S", "rosa-pastel", "osito"),
      variant("v5", null, "S", "rosa-pastel", "osito"),
    ];
    expect(findVariantCollisions(variants, { kind: "colors", sourceIds: ["rosa-pastel"], targetId: "rosado" })).toEqual([
      { groupId: "g1", variants: [{ id: "v1", name: "Variante v1" }, { id: "v2", name: "Variante v2" }] },
    ]);
  });

  it("ignores standalone products, other attributes and subcategory merges", () => {
    const variants = [variant("v1", "g1", "S", "rosado", "osito"), variant("v2", "g1", "S", "rosa-pastel", "osito panda")];
    expect(findVariantCollisions(variants, { kind: "colors", sourceIds: ["rosa-pastel"], targetId: "rosado" })).toEqual([]);
    expect(findVariantCollisions(variants, { kind: "designs", sourceIds: ["osito panda"], targetId: "osito" })).toEqual([]);
    expect(findVariantCollisions(variants, { kind: "categories", sourceIds: ["a"], targetId: "b" })).toEqual([]);
  });

  it("also catches two sources collapsing into each other", () => {
    const variants = [variant("v1", "g1", "S", "fluor", "x"), variant("v2", "g1", "S", "neon", "x")];
    expect(findVariantCollisions(variants, { kind: "colors", sourceIds: ["fluor", "neon"], targetId: "brillante" })).toHaveLength(1);
  });
});

describe("merge copy", () => {
  const preview: AttributeMergePreview = {
    kind: "colors",
    target: { id: "t", name: "Rosado", products: 109 },
    sources: [{ id: "s", name: "Rosa pastel", products: 92 }],
    products: { active: 89, archived: 3 },
    groups: 4,
    collisions: [],
    offers: 0,
    aliases: 0,
    crossType: false,
  };

  it("names the group and the variants that would collide", () => {
    const message = collisionMessage([
      { groupId: "g1", groupName: "Llaveros Osito", variants: [{ id: "a", name: "Llavero café" }, { id: "b", name: "Llavero panda" }] },
      { groupId: "g2", groupName: "Stickers", variants: [] },
    ]);
    expect(message).toContain("«Llaveros Osito»");
    expect(message).toContain("«Llavero café» y «Llavero panda»");
    expect(message).toContain("y 1 grupo más");
  });

  it("summarises the merge with gender and number", () => {
    expect(attributeMergeMessage(preview, 92)).toBe("92 productos pasaron a «Rosado»; color «Rosa pastel» queda archivado.");
    expect(attributeMergeMessage({ ...preview, kind: "categories", sources: [preview.sources[0], { id: "x", name: "Cinta", products: 4 }] }, 1)).toBe(
      "1 producto pasó a «Rosado»; subcategorías «Rosa pastel», «Cinta» quedan archivados.",
    );
  });
});

describe("parseMoveCategoriesBody", () => {
  it("needs a destination category and at least one subcategory", () => {
    expect(parseMoveCategoriesBody({ ids: ["a", "a", "b"], typeId: " t " })).toEqual({ ids: ["a", "b"], typeId: "t" });
    expect(() => parseMoveCategoriesBody({ ids: ["a"] })).toThrow(/categoría de destino/);
    expect(() => parseMoveCategoriesBody({ ids: [], typeId: "t" })).toThrow(/al menos una subcategoría/);
  });
});
