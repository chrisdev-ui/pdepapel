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
    expect(expandSearchTerms("kit lapicero cuaderno sticker").length).toBeLessThanOrEqual(12);
  });

  it("builds one contains clause per variant", () => {
    expect(productNameSearchWhere("goma")).toEqual([
      { name: { contains: "goma" } },
      { name: { contains: "borrador" } },
    ]);
  });
});

// ============ Plural, género y etiquetas del catálogo ============

import {
  colorLemma,
  colorTerms,
  pluralStem,
  productNameTokenSearchWhere,
  productTokenSearchWhere,
  searchTokens,
  wordForms,
} from "@/lib/search-terms";

describe("la raíz de plural: lo que comparten el singular y el plural", () => {
  it("-s y -es regulares: la raíz es el singular entero", () => {
    expect(pluralStem("cuadernos")).toBe("cuaderno");
    expect(pluralStem("tijeras")).toBe("tijera");
    expect(pluralStem("papeles")).toBe("papel");
    expect(pluralStem("colores")).toBe("color");
    expect(pluralStem("marcadores")).toBe("marcador");
    expect(pluralStem("kits")).toBe("kit");
    expect(pluralStem("stickers")).toBe("sticker");
    expect(pluralStem("clips")).toBe("clip");
  });

  it("-es ambiguo: «sobres» es sobre+s y «colores» es color+es; la raíz vale para los dos", () => {
    // «sobr» está dentro de «sobre» y de «sobres»; «estuch» dentro de
    // «estuche» y «estuches». Un poco más corta que el singular, nunca mal.
    expect(pluralStem("sobres")).toBe("sobr");
    expect(pluralStem("estuches")).toBe("estuch");
    expect("sobre".startsWith(pluralStem("sobres"))).toBe(true);
    expect("estuche".startsWith(pluralStem("estuches"))).toBe(true);
  });

  it("-z / -ces: dos formas enteras, nunca el prefijo «lápi» (que está en «lapicero»)", () => {
    expect(pluralStem("lápices")).toBe("lápiz");
    expect(pluralStem("lápiz")).toBe("lápiz");
    expect(pluralStem("lapices")).toBe("lapiz");
    expect(wordForms("lápiz")).toEqual(["lápiz", "lápices"]);
    expect(wordForms("lápices")).toEqual(["lápiz", "lápices"]);
    expect(wordForms("cuadernos")).toEqual(["cuaderno"]);
  });

  it("-íes: «bisturíes» → «bisturí»", () => {
    expect(pluralStem("bisturíes")).toBe("bisturí");
  });

  it("el singular se queda como está: ya es raíz de su plural", () => {
    for (const w of ["cuaderno", "papel", "sobre", "estuche", "kawaii", "perrito", "azul"]) {
      expect(pluralStem(w)).toBe(w);
    }
  });

  it("las invariables y las cortas no se recortan", () => {
    for (const w of ["gris", "tres", "dos", "mes", "lunes", "crisis", "tesis", "bus", "los", "las"]) {
      expect(pluralStem(w)).toBe(w);
    }
  });

  it("conserva la eñe y las tildes: la base compara sin ellas", () => {
    expect(pluralStem("moños")).toBe("moño");
    expect(pluralStem("botones")).toBe("boton");
    expect(pluralStem("Bolígrafos")).toBe("bolígrafo");
  });
});

describe("los colores se pliegan a su lema", () => {
  it("género y número: rosada, rosadas, amarilla, azules, grises", () => {
    expect(colorLemma("rosada")).toBe("rosado");
    expect(colorLemma("rosadas")).toBe("rosado");
    expect(colorLemma("rosas")).toBe("rosa");
    expect(colorLemma("amarilla")).toBe("amarillo");
    expect(colorLemma("amarillas")).toBe("amarillo");
    expect(colorLemma("azules")).toBe("azul");
    expect(colorLemma("grises")).toBe("gris");
    expect(colorLemma("marrones")).toBe("marron");
    expect(colorLemma("Negra")).toBe("negro");
  });

  it("lo que no es color devuelve null y no se toca", () => {
    for (const w of ["perrito", "cuaderno", "tote", "kawaii", "rosal"]) {
      expect(colorLemma(w)).toBeNull();
    }
  });

  it("los términos a buscar son todos los lemas del grupo", () => {
    expect(colorTerms("rosada")).toEqual(["rosa", "rosado"]);
    expect(colorTerms("lilas")).toEqual(["lila", "morado", "violeta", "púrpura", "lavanda"]);
    expect(colorTerms("café")).toEqual(["café", "marrón", "castaño"]);
    expect(colorTerms("perrito")).toEqual([]);
  });
});

describe("la búsqueda de frase de la tienda ya no depende del número ni del género", () => {
  it("«cuadernos kuromi» también busca «cuaderno kuromi»", () => {
    const terms = expandSearchTerms("cuadernos kuromi");
    expect(terms[0]).toBe("cuadernos kuromi");
    expect(terms).toContain("cuaderno kuromi");
    // Y los sinónimos salen sobre la raíz.
    expect(terms).toContain("libreta kuromi");
  });

  it("«lápices» y «lápiz» se buscan el uno al otro, sin tocar «lapicero»", () => {
    expect(expandSearchTerms("lápices")).toEqual(["lápices", "lápiz"]);
    expect(expandSearchTerms("lápiz")).toEqual(["lápiz", "lápices"]);
    expect(expandSearchTerms("lápices")).not.toContain("lápi");
  });

  it("«rosada» busca «rosa» y «rosado»", () => {
    const terms = expandSearchTerms("rosada");
    expect(terms).toEqual(expect.arrayContaining(["rosada", "rosa", "rosado"]));
    expect(productNameSearchWhere("cartuchera rosada")).toContainEqual({
      name: { contains: "cartuchera rosa" },
    });
  });

  it("un color en plural: «amarillas» → «amarillo»", () => {
    expect(expandSearchTerms("amarillas")).toEqual(
      expect.arrayContaining(["amarillas", "amarilla", "amarillo"]),
    );
  });

  it("lo que ya funcionaba sigue igual: sinónimos en singular, sin variantes de más", () => {
    expect(expandSearchTerms("libreta")).toEqual(["libreta", "cuaderno", "block", "bloc"]);
    expect(expandSearchTerms("esfero rosa")[0]).toBe("esfero rosa");
    expect(expandSearchTerms("esfero rosa")).toContain("bolígrafo rosa");
    expect(expandSearchTerms("esfero rosa")).toContain("esfero rosado");
  });
});

describe("cada palabra también se busca en las etiquetas", () => {
  it("el fallo real: «tote bag de perrito» mira el diseño, no solo el nombre", () => {
    const where = productNameTokenSearchWhere("tote bag de perrito");
    expect(searchTokens("tote bag de perrito")).toEqual(["tote", "bag", "perrito"]);
    expect(where).toHaveLength(3);
    const perrito = where[2].OR!;
    expect(perrito).toContainEqual({ name: { contains: "perrito" } });
    expect(perrito).toContainEqual({ design: { is: { name: { contains: "perrito" } } } });
    expect(perrito).toContainEqual({ color: { is: { name: { contains: "perrito" } } } });
    expect(perrito).toContainEqual({ category: { is: { name: { contains: "perrito" } } } });
    expect(perrito).toContainEqual({ productGroup: { is: { name: { contains: "perrito" } } } });
    // La primera pasada sigue sin mirar la descripción.
    expect(JSON.stringify(where)).not.toContain("description");
  });

  it("el plural entra por la raíz: «perritos» busca «perrito», «cuadernos» busca «cuaderno»", () => {
    const [perritos] = productNameTokenSearchWhere("perritos");
    expect(perritos.OR).toContainEqual({ design: { is: { name: { contains: "perrito" } } } });
    expect(perritos.OR).toContainEqual({ name: { contains: "perrito" } });
    const [cuadernos] = productNameTokenSearchWhere("cuadernos");
    expect(cuadernos.OR).toContainEqual({ name: { contains: "cuaderno" } });
    expect(cuadernos.OR).toContainEqual({ category: { is: { name: { contains: "cuaderno" } } } });
  });

  it("el color se pliega: «amarilla» busca el color «amarillo»; «rosada», «rosa» y «rosado»", () => {
    const [amarilla] = productNameTokenSearchWhere("amarilla");
    expect(amarilla.OR).toContainEqual({ color: { is: { name: { contains: "amarillo" } } } });
    expect(amarilla.OR).toContainEqual({ name: { contains: "amarillo" } });
    const [rosada] = productNameTokenSearchWhere("rosada");
    expect(rosada.OR).toContainEqual({ color: { is: { name: { contains: "rosa" } } } });
    expect(rosada.OR).toContainEqual({ color: { is: { name: { contains: "rosado" } } } });
  });

  it("categoría y grupo llevan los sinónimos; el diseño, solo la palabra", () => {
    const [libreta] = productNameTokenSearchWhere("libreta rosa");
    const categorias = libreta.OR!.filter((c: any) => c.category).map(
      (c: any) => c.category.is.name.contains,
    );
    // «libreta» tiene que dar con la categoría «Cuadernos».
    expect(categorias).toContain("cuaderno");
    expect(categorias).toContain("libreta");
    const disenos = libreta.OR!.filter((c: any) => c.design).map(
      (c: any) => c.design.is.name.contains,
    );
    expect(disenos).toEqual(["libreta"]);
  });

  it("tote, bag, bolso y bolsa son la misma cosa, en singular y en plural", () => {
    for (const palabra of ["tote", "bag", "bolso", "bolsa", "bolsos", "totes"]) {
      const nombres = productNameTokenSearchWhere(palabra)[0].OR!.filter((c: any) => c.name).map(
        (c: any) => c.name.contains,
      );
      // Cada una de las cuatro formas tiene que quedar cubierta por alguna
      // variante que sea prefijo suyo («tot» cubre «tote»; «bolso», «bolsos»).
      for (const forma of ["tote", "bag", "bolso", "bolsa"]) {
        expect(nombres.some((n: string) => forma.startsWith(n))).toBe(true);
      }
    }
    expect(productNameTokenSearchWhere("bolsos")[0].OR).toContainEqual({
      category: { is: { name: { contains: "bolso" } } },
    });
  });

  it("la pasada amplia añade la descripción por la raíz y conserva las etiquetas", () => {
    const [amarillas] = productTokenSearchWhere("amarillas");
    expect(amarillas.OR).toContainEqual({ description: { contains: "amarilla" } });
    expect(amarillas.OR).toContainEqual({ color: { is: { name: { contains: "amarillo" } } } });
  });
});
