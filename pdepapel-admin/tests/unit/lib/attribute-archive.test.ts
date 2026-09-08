import { describe, expect, it } from "vitest";

import {
  ACTIVE_ATTRIBUTE_WHERE,
  activeOrCurrentWhere,
  attributeArchiveMessage,
  attributeRevalidationPaths,
  blockedArchiveMessage,
  parseAttributeArchiveBody,
} from "@/lib/attribute-archive";

describe("parseAttributeArchiveBody", () => {
  it("accepts the five attribute kinds with unique ids and a boolean flag", () => {
    expect(parseAttributeArchiveBody({ kind: "colors", ids: ["a", "b", "a", ""], archived: true })).toEqual({
      kind: "colors",
      ids: ["a", "b"],
      archived: true,
    });
  });

  it("rejects unknown kinds, empty selections and missing flags", () => {
    expect(() => parseAttributeArchiveBody({ kind: "products", ids: ["a"], archived: true })).toThrow(/tipo de atributo/);
    expect(() => parseAttributeArchiveBody({ kind: "sizes", ids: [], archived: true })).toThrow(/al menos un atributo/);
    expect(() => parseAttributeArchiveBody({ kind: "sizes", ids: ["a"] })).toThrow(/archiva o se restaura/);
    expect(() =>
      parseAttributeArchiveBody({ kind: "sizes", ids: Array.from({ length: 201 }, (_, i) => `id-${i}`), archived: false }),
    ).toThrow(/200/);
  });
});

describe("archive copy", () => {
  it("explains which subcategories still have active products", () => {
    const message = blockedArchiveMessage("categories", [
      { name: "Agendas", count: 3 },
      { name: "Libretas", count: 1 },
      { name: "Stickers", count: 2 },
      { name: "Lapiceros", count: 4 },
    ]);
    expect(message).toContain("«Agendas» (3)");
    expect(message).toContain("y 1 más");
    expect(message).toContain("archívalos antes de archivarla");
    expect(blockedArchiveMessage("types", [{ name: "Papelería", count: 2 }])).toContain("subcategorías activas");
  });

  it("builds result messages with the right gender and number", () => {
    expect(attributeArchiveMessage({ kind: "colors", ids: ["a"], archived: true }, 1)).toBe("1 color archivado");
    expect(attributeArchiveMessage({ kind: "colors", ids: ["a", "b"], archived: false }, 2)).toBe("2 colores restaurados");
    expect(attributeArchiveMessage({ kind: "categories", ids: ["a"], archived: true }, 1)).toBe("1 subcategoría archivada");
    expect(attributeArchiveMessage({ kind: "types", ids: ["a", "b"], archived: false }, 2)).toBe("2 categorías restauradas");
  });
});

describe("readers", () => {
  it("lists active attributes plus the current one for edit forms", () => {
    expect(ACTIVE_ATTRIBUTE_WHERE).toEqual({ isArchived: false });
    expect(activeOrCurrentWhere(null)).toEqual({ isArchived: false });
    expect(activeOrCurrentWhere("cat-1")).toEqual({ OR: [{ isArchived: false }, { id: "cat-1" }] });
  });

  it("revalidates the shop, the sitemap and each affected category page once", () => {
    expect(attributeRevalidationPaths(["agendas", "agendas", "libretas"])).toEqual([
      "/",
      "/tienda",
      "/sitemap.xml",
      "/categoria/agendas",
      "/categoria/libretas",
    ]);
  });
});
