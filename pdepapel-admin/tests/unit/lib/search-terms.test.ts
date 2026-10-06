import { describe, expect, it } from "vitest";

import {
  expandSearchTerms,
  nameForms,
  normalizeSearchTerm,
  productNameSearchConditions,
  searchTokenForms,
} from "@/lib/search-terms";

describe("search terms", () => {
  it("normalizes spacing and case", () => {
    expect(normalizeSearchTerm("  Cuaderno   Snoopy ")).toBe("cuaderno snoopy");
  });

  it("returns nothing for an empty query", () => {
    expect(expandSearchTerms("   ")).toEqual([]);
    expect(productNameSearchConditions("")).toEqual([]);
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

  it("builds one condition per word, with one contains clause per form", () => {
    expect(productNameSearchConditions("goma")).toEqual([
      { OR: [{ name: { contains: "goma" } }, { name: { contains: "borrador" } }] },
    ]);
  });
});

// ============ Plural, género y etiquetas del catálogo ============

import {
  colorLemma,
  colorTerms,
  formCondition,
  matchForm,
  pluralStem,
  wholeWordPieces,
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
    // El «-es» ambiguo deja las dos lecturas: «tot» (corta, palabra entera) y «tote».
    expect(wordForms("totes")).toEqual(["tot", "tote"]);
    expect(wordForms("colores")).toEqual(["color", "colore"]);
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
    const [, rosada] = productNameSearchConditions("cartuchera rosada");
    expect(rosada.OR).toEqual([{ name: { contains: "rosa" } }]);
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
      // Las formas largas van en `name.contains`; las cortas («bag», «tot»)
      // como palabra entera, anidadas en un OR con `equals`.
      const nombres = productNameTokenSearchWhere(palabra)[0].OR!.flatMap((c: any) =>
        c.name?.contains ? [c.name.contains] : (c.OR ?? []).flatMap((o: any) => (o.name?.equals ? [o.name.equals] : [])),
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

// ============ La tienda busca palabra por palabra, no la frase seguida ============

describe("las formas de una palabra para compararla con un nombre", () => {
  it("palabra, raíz, sinónimos y lemas, sin las que otra más corta ya cubre", () => {
    // «cuadernos» sobra porque «cuaderno» ya la cubre; «block» porque «bloc».
    expect(nameForms("cuadernos")).toEqual(["cuaderno", "libreta", "bloc"]);
    expect(nameForms("lápices").sort()).toEqual(["lápices", "lápiz"]);
    // «rosa» ya cubre «rosada» y «rosado».
    expect(nameForms("rosada")).toEqual(["rosa"]);
    expect(nameForms("amarilla")).toEqual(["amarilla", "amarillo"]);
    expect(nameForms("kuromi")).toEqual(["kuromi"]);
  });
});

describe("la consulta de la tienda, palabra por palabra", () => {
  it("«cuadernos kuromi» exige las dos palabras, cada una en sus formas, sin orden", () => {
    const condiciones = productNameSearchConditions("cuadernos kuromi");
    expect(condiciones).toHaveLength(2);
    expect(condiciones[0].OR).toContainEqual({ name: { contains: "cuaderno" } });
    expect(condiciones[1].OR).toEqual([{ name: { contains: "kuromi" } }]);
  });

  it("las palabras de unión se caen; las de dos letras se quedan («a5», «hb»)", () => {
    expect(searchTokenForms("cuaderno de kuromi").map((p) => p.token)).toEqual(["cuaderno", "kuromi"]);
    expect(searchTokenForms("cuaderno a5").map((p) => p.token)).toEqual(["cuaderno", "a5"]);
    expect(searchTokenForms("lápiz hb").map((p) => p.token)).toEqual(["lápiz", "hb"]);
  });

  it("sin palabras significativas se busca la frase tal cual, nunca todo el catálogo", () => {
    expect(searchTokenForms("de la")).toEqual([{ token: "de la", forms: ["de la"] }]);
    expect(productNameSearchConditions("de la")).toEqual([{ OR: [{ name: { contains: "de la" } }] }]);
    expect(searchTokenForms("   ")).toEqual([]);
  });

  it("la precisión del lote anterior se conserva: «lápices» no toca «lapicero»", () => {
    const [lapices] = productNameSearchConditions("lápices");
    expect(JSON.stringify(lapices)).not.toContain('"lápi"');
  });
});

describe("las formas cortas se comparan como palabra entera", () => {
  it("tres letras o menos: la palabra y sus plurales, nunca dentro de otra", () => {
    expect(matchForm("pin")).toEqual({ words: ["pin", "pins", "pines"] });
    expect(matchForm("kit")).toEqual({ words: ["kit", "kits", "kites"] });
    expect(matchForm("cuaderno")).toEqual({ contains: "cuaderno" });
  });

  it("en Prisma: igual, empieza por, termina en, o entre espacios", () => {
    const condicion = formCondition("name", "pin") as unknown as { OR: unknown[] };
    expect(condicion.OR).toContainEqual({ name: { equals: "pin" } });
    expect(condicion.OR).toContainEqual({ name: { startsWith: "pin " } });
    expect(condicion.OR).toContainEqual({ name: { endsWith: " pines" } });
    expect(condicion.OR).toContainEqual({ name: { contains: " pins " } });
    // Y con los signos que van pegados en el catálogo: comillas, guion, punto…
    expect(condicion.OR).toContainEqual({ name: { contains: '"pin ' } });
    expect(condicion.OR).toContainEqual({ name: { contains: " pin-" } });
    expect(condicion.OR).toContainEqual({ name: { endsWith: " pin" } });
    expect(condicion.OR).toContainEqual({ name: { startsWith: "pin." } });
    expect(formCondition("name", "cuaderno")).toEqual({ name: { contains: "cuaderno" } });
  });

  it("«pines» y «kit» ya no arrastran «pincel» ni «Kitty»; «totes» sigue dando con «Tote bag»", () => {
    expect(nameForms("pines")).toEqual(["pin", "pine"]);
    expect(nameForms("totes")).toEqual(expect.arrayContaining(["tot", "tote"]));
    const [pines] = productNameSearchConditions("pines");
    expect(JSON.stringify(pines)).not.toContain('"contains":"pin"');
    expect(JSON.stringify(pines)).toContain('"contains":" pin "');
    expect(JSON.stringify(pines)).toContain('"contains":"pine"');
  });
});

describe("lo que la palabra entera no debe perder", () => {
  it("«kit» también trae Hello Kitty; «set» y «kitty» no se mezclan", () => {
    expect(nameForms("kit")).toContain("kitty");
    expect(nameForms("kits")).toContain("kitty");
    expect(nameForms("set")).not.toContain("kitty");
    expect(nameForms("kitty")).toEqual(["kitty"]);
  });

  it("un número corto busca la cantidad: «12» da con «x12» y «100» con «100h», no con «120»", () => {
    expect(matchForm("12")).toEqual({ words: ["12", "x12", "12h", "12hojas"] });
    expect(matchForm("100")).toEqual({ words: ["100", "x100", "100h", "100hojas"] });
    expect(JSON.stringify(formCondition("name", "12"))).not.toContain('"contains":"12"');
  });

  it("una medida con decimales se busca tal cual: «0.5mm» y «0.5»", () => {
    expect(searchTokens("minas 0.5mm", { minLength: 2 })).toEqual(["minas", "0.5mm"]);
    expect(searchTokens("¿tienes minas 0.5?", { minLength: 2 })).toEqual(["minas", "0.5"]);
    expect(matchForm("0.5")).toEqual({ contains: "0.5" });
    expect(matchForm("0.5mm")).toEqual({ contains: "0.5mm" });
    // Los signos de los bordes siguen cayendo.
    expect(searchTokens("¿tienes azul?")).toEqual(["azul"]);
  });

  it("los bordes de palabra entera: comillas, guion, punto, paréntesis, apóstrofo", () => {
    const piezas = wholeWordPieces("toy");
    expect(piezas.contains).toContain('"toy ');
    expect(piezas.contains).toContain(" toy-");
    expect(piezas.endsWith).toContain(" toy");
    expect(piezas.startsWith).toContain("toy ");
    expect(piezas.equals).toBe("toy");
  });
});

describe("«lego» sigue encontrando los bloques de construcción", () => {
  // Los productos ya no se llaman «Lego» (marca registrada), pero la
  // clientela los sigue buscando así.
  const coincide = (query: string, name: string) =>
    productNameSearchConditions(query).every((condicion) =>
      (condicion.OR as { name?: { contains?: string } }[]).some(
        (c) => c.name?.contains !== undefined && normalizeSearchTerm(name).includes(c.name.contains),
      ),
    );

  it("«lego» y «legos» buscan «bloques» en el nombre", () => {
    expect(nameForms("lego")).toEqual(["lego", "bloqu"]);
    expect(nameForms("legos")).toEqual(["lego", "bloqu"]);
    expect(expandSearchTerms("lego")).toEqual(["lego", "bloques"]);
  });

  it("encuentra los productos renombrados y nada más", () => {
    for (const name of ["Bloques de construcción Batman", "Bloques de construcción Winnie Pooh y sus amigos", "Tajalápiz de bloques"]) {
      expect(coincide("lego", name)).toBe(true);
      expect(coincide("legos", name)).toBe(true);
    }
    expect(coincide("lego batman", "Bloques de construcción Batman")).toBe(true);
    expect(coincide("lego", "Cuaderno Kuromi")).toBe(false);
    expect(coincide("lego", "Block iris x35 hojas")).toBe(false);
  });
});
