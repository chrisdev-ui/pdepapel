import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api-errors";
import {
  cleanTaxonomyName,
  duplicateTaxonomyMessage,
  findDuplicateTaxonomyName,
  isSameTaxonomyName,
  isUniqueConstraintError,
  mapTaxonomyUniqueError,
  missingTaxonomyMessage,
  normalizeTaxonomyName,
  requiredTaxonomyFieldMessage,
} from "@/lib/taxonomy";

describe("taxonomy names", () => {
  it("normalises trimming, inner spaces, case and accents", () => {
    expect(normalizeTaxonomyName("  Rojó  ")).toBe("rojo");
    expect(normalizeTaxonomyName("Lápices   &  Colores")).toBe("lapices & colores");
    expect(normalizeTaxonomyName("ÑANDÚ")).toBe("nandu");
    expect(normalizeTaxonomyName(null)).toBe("");
    expect(normalizeTaxonomyName(undefined)).toBe("");
  });

  it("cleans a name for storage without touching case or accents", () => {
    expect(cleanTaxonomyName("  Lápices   de   Colores ")).toBe("Lápices de Colores");
    expect(cleanTaxonomyName(undefined)).toBe("");
  });

  it("compares names case- and accent-insensitively and never matches blanks", () => {
    expect(isSameTaxonomyName("Rojo", "rojó")).toBe(true);
    expect(isSameTaxonomyName("Rojo", "Rojo oscuro")).toBe(false);
    expect(isSameTaxonomyName("", "")).toBe(false);
    expect(isSameTaxonomyName("   ", null)).toBe(false);
  });

  it("finds a duplicate among existing rows and ignores the row being edited", () => {
    const rows = [
      { id: "c1", name: "Rojo" },
      { id: "c2", name: "Azul" },
    ];
    expect(findDuplicateTaxonomyName(rows, "ROJÓ")).toEqual(rows[0]);
    expect(findDuplicateTaxonomyName(rows, " rojo ", "c1")).toBeNull();
    expect(findDuplicateTaxonomyName(rows, "rojo", "c2")).toEqual(rows[0]);
    expect(findDuplicateTaxonomyName(rows, "Verde")).toBeNull();
    expect(findDuplicateTaxonomyName(rows, "   ")).toBeNull();
  });
});

describe("taxonomy messages", () => {
  it("agrees article and participle with the entity gender", () => {
    expect(duplicateTaxonomyMessage("color", " Rojo ")).toBe("Ya existe un color llamado «Rojo» en esta tienda.");
    expect(duplicateTaxonomyMessage("design", "Osito")).toBe("Ya existe un diseño llamado «Osito» en esta tienda.");
    expect(duplicateTaxonomyMessage("size", "Pequeño")).toBe("Ya existe un tamaño llamado «Pequeño» en esta tienda.");
    expect(duplicateTaxonomyMessage("category", "Agendas", "type")).toBe("Ya existe una subcategoría llamada «Agendas» en esta categoría.");
    expect(duplicateTaxonomyMessage("type", "Útiles")).toBe("Ya existe una categoría llamada «Útiles» en esta tienda.");
  });

  it("builds the 404 and 400 copy with the right vocabulary (never «tipo»)", () => {
    expect(missingTaxonomyMessage("type")).toBe("La categoría no existe en esta tienda.");
    expect(missingTaxonomyMessage("category")).toBe("La subcategoría no existe en esta tienda.");
    expect(missingTaxonomyMessage("color")).toBe("El color no existe en esta tienda.");
    expect(requiredTaxonomyFieldMessage("color", "nombre")).toBe("El nombre del color es obligatorio.");
    expect(requiredTaxonomyFieldMessage("category", "nombre")).toBe("El nombre de la subcategoría es obligatorio.");
    expect(requiredTaxonomyFieldMessage("size", "valor")).toBe("El valor del tamaño es obligatorio.");
  });
});

describe("unique-index mapping", () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.0.0",
    meta: { target: "Color_storeId_name_key" },
  });

  it("recognises P2002 only", () => {
    expect(isUniqueConstraintError(p2002)).toBe(true);
    expect(isUniqueConstraintError(new Error("otro"))).toBe(false);
    expect(
      isUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6.0.0" }),
      ),
    ).toBe(false);
  });

  it("turns P2002 into the Spanish 409 and leaves other errors untouched", () => {
    const mapped = mapTaxonomyUniqueError(p2002, "color", "Rojo");
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped).toMatchObject({ statusCode: 409, message: "Ya existe un color llamado «Rojo» en esta tienda." });

    const other = new Error("boom");
    expect(mapTaxonomyUniqueError(other, "color", "Rojo")).toBe(other);
  });
});

describe("hex colour values", () => {
  it("trims and upper-cases a valid value and rejects the rest", async () => {
    const { normalizeHexColor, hexColorIssue } = await import("@/lib/taxonomy");
    expect(normalizeHexColor("#8e44ad ")).toBe("#8E44AD");
    expect(normalizeHexColor(" #fff")).toBe("#FFF");
    expect(normalizeHexColor("#12345678")).toBe("#12345678");
    expect(normalizeHexColor("8E44AD")).toBeNull();
    expect(normalizeHexColor("#GGGGGG")).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
    // Pista para valores ya guardados: el espacio final de «Morado» en producción.
    expect(hexColorIssue("#8E44AD ")).toBe("espacios");
    expect(hexColorIssue("#8E44AD")).toBeNull();
    expect(hexColorIssue("morado")).toBe("invalido");
  });
});

describe("names to fix and similar names", () => {
  it("flags lowercase-first and badly spaced names and suggests the clean form", async () => {
    const { taxonomyNameIssues, suggestedTaxonomyName } = await import("@/lib/taxonomy");
    expect(taxonomyNameIssues("cremallera gruesa")).toEqual(["minuscula"]);
    expect(taxonomyNameIssues("Osito  panda ")).toEqual(["espacios"]);
    expect(taxonomyNameIssues("zanahoria  ")).toEqual(["minuscula", "espacios"]);
    expect(taxonomyNameIssues("Osito panda")).toEqual([]);
    expect(taxonomyNameIssues("123")).toEqual([]);
    expect(suggestedTaxonomyName("  osito  panda ")).toBe("Osito panda");
    expect(suggestedTaxonomyName("")).toBe("");
  });

  it("recognises the real production pairs and leaves unrelated names alone", async () => {
    const { taxonomyNameSimilarity } = await import("@/lib/taxonomy");
    expect(taxonomyNameSimilarity("Rojo", "rojó")).toBe("igual");
    expect(taxonomyNameSimilarity("Cinta", "Cintas")).toBe("plural");
    expect(taxonomyNameSimilarity("Cintas resaltadoras", "Cinta")).toBe("prefijo");
    expect(taxonomyNameSimilarity("Osito", "Osito panda")).toBe("prefijo");
    expect(taxonomyNameSimilarity("Sobres plásticos", "Sobres")).toBe("prefijo");
    expect(taxonomyNameSimilarity("Verde", "Verde pastel")).toBe("prefijo");
    expect(taxonomyNameSimilarity("Rosa pastel", "Rosado")).toBe("raiz");
    expect(taxonomyNameSimilarity("Elefante", "Elegante")).toBeNull();
    expect(taxonomyNameSimilarity("Gorro", "Zorro")).toBeNull();
    expect(taxonomyNameSimilarity("Dorado", "Morado")).toBeNull();
    expect(taxonomyNameSimilarity("Arte", "Artesanal")).toBeNull();
    expect(taxonomyNameSimilarity("", "Rojo")).toBeNull();
  });

  it("lists similar rows, equal names first, skipping the row being edited", async () => {
    const { findSimilarTaxonomyNames } = await import("@/lib/taxonomy");
    const rows = [
      { id: "1", name: "Rosado" },
      { id: "2", name: "Rosa Pastel" },
      { id: "3", name: "Azul" },
      { id: "4", name: "Rosa pastel" },
    ];
    expect(findSimilarTaxonomyNames(rows, "Rosa pastel", "4")).toEqual([
      { row: rows[1], reason: "igual" },
      { row: rows[0], reason: "raiz" },
    ]);
    expect(findSimilarTaxonomyNames(rows, "Azul", "3")).toEqual([]);
  });
});
