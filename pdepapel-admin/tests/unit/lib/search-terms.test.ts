import { describe, expect, it } from "vitest";

import {
  expandSearchTerms,
  normalizeSearchTerm,
  productNameSearchWhere,
} from "@/lib/search-terms";

describe("search terms", () => {
  it("normalizes spacing and case", () => {
    expect(normalizeSearchTerm("  Cuaderno   Snoopy ")).toBe("cuaderno snoopy");
  });

  it("returns nothing for an empty query", () => {
    expect(expandSearchTerms("   ")).toEqual([]);
    expect(productNameSearchWhere("")).toEqual([]);
  });

  it("expands synonyms in both directions", () => {
    expect(expandSearchTerms("libreta")).toEqual(["libreta", "cuaderno", "block", "bloc"]);
    expect(expandSearchTerms("cuaderno")).toContain("libreta");
  });

  it("keeps the rest of the phrase when swapping one word", () => {
    expect(expandSearchTerms("esfero rosa")).toContain("bolígrafo rosa");
    expect(expandSearchTerms("esfero rosa")[0]).toBe("esfero rosa");
  });

  it("matches plurals and accents against the synonym table", () => {
    expect(expandSearchTerms("Lapiceros")).toContain("bolígrafo");
    expect(expandSearchTerms("boligrafo")).toContain("lapicero");
  });

  it("caps the number of variants", () => {
    expect(expandSearchTerms("kit lapicero cuaderno sticker").length).toBeLessThanOrEqual(8);
  });

  it("builds one contains clause per variant", () => {
    expect(productNameSearchWhere("goma")).toEqual([
      { name: { contains: "goma" } },
      { name: { contains: "borrador" } },
    ]);
  });
});

// ============ Etiquetas del catálogo: diseño, color, categoría, grupo ============

import {
  labelStem,
  productNameTokenSearchWhere,
  productTokenSearchWhere,
  searchTokens,
} from "@/lib/search-terms";

describe("la raíz para comparar con etiquetas", () => {
  it("quita el plural y la última vocal: la clienta no escribe como el catálogo", () => {
    // Color «Amarillo», diseño «Perrito», categoría «Cuadernos».
    expect(labelStem("amarilla")).toBe("amarill");
    expect(labelStem("perritos")).toBe("perrit");
    expect(labelStem("Perrito")).toBe("perrit");
    expect(labelStem("cuaderno")).toBe("cuadern");
    expect(labelStem("gatito")).toBe("gatit");
  });

  it("deja en paz lo corto y lo que no acaba en vocal", () => {
    expect(labelStem("azul")).toBe("azul");
    expect(labelStem("oso")).toBe("oso");
    expect(labelStem("kawaii")).toBe("kawaii");
    expect(labelStem("flores")).toBe("flor");
  });

  it("conserva la eñe y las tildes: la base las distingue", () => {
    expect(labelStem("moños")).toBe("moñ");
    expect(labelStem("mágico")).toBe("mágic");
  });
});

describe("cada palabra también se busca en las etiquetas", () => {
  it("el fallo real: «tote bag de perrito» mira el diseño, no solo el nombre", () => {
    const where = productNameTokenSearchWhere("tote bag de perrito");
    expect(searchTokens("tote bag de perrito")).toEqual(["tote", "bag", "perrito"]);
    expect(where).toHaveLength(3);
    const perrito = where[2].OR!;
    expect(perrito).toContainEqual({ name: { contains: "perrito" } });
    expect(perrito).toContainEqual({ design: { is: { name: { contains: "perrit" } } } });
    expect(perrito).toContainEqual({ color: { is: { name: { contains: "perrit" } } } });
    expect(perrito).toContainEqual({ category: { is: { name: { contains: "perrit" } } } });
    expect(perrito).toContainEqual({ productGroup: { is: { name: { contains: "perrit" } } } });
    // La primera pasada sigue sin mirar la descripción.
    expect(JSON.stringify(where)).not.toContain("description");
  });

  it("categoría y grupo llevan los sinónimos; diseño y color, solo la palabra", () => {
    const [libreta] = productNameTokenSearchWhere("libreta rosa");
    const categorias = libreta.OR!.filter((c: any) => c.category).map(
      (c: any) => c.category.is.name.contains,
    );
    // «libreta» tiene que dar con la categoría «Cuadernos».
    expect(categorias).toContain("cuadern");
    expect(categorias).toContain("libret");
    const disenos = libreta.OR!.filter((c: any) => c.design).map(
      (c: any) => c.design.is.name.contains,
    );
    expect(disenos).toEqual(["libret"]);
  });

  it("tote, bag, bolso y bolsa son la misma cosa", () => {
    for (const palabra of ["tote", "bag", "bolso", "bolsa"]) {
      const nombres = productNameTokenSearchWhere(palabra)[0].OR!.filter((c: any) => c.name).map(
        (c: any) => c.name.contains,
      );
      expect(nombres).toEqual(expect.arrayContaining(["tote", "bag", "bolso", "bolsa"]));
    }
    // El plural entra por los sinónimos (que van en singular) y por la raíz
    // en las etiquetas; el nombre se sigue buscando con la palabra tal cual.
    const plural = productNameTokenSearchWhere("bolsos")[0].OR!;
    expect(plural).toContainEqual({ name: { contains: "tote" } });
    expect(plural).toContainEqual({ category: { is: { name: { contains: "bols" } } } });
  });

  it("la pasada amplia añade la descripción y conserva las etiquetas", () => {
    const [amarilla] = productTokenSearchWhere("amarilla");
    expect(amarilla.OR).toContainEqual({ description: { contains: "amarilla" } });
    expect(amarilla.OR).toContainEqual({ color: { is: { name: { contains: "amarill" } } } });
  });
});
