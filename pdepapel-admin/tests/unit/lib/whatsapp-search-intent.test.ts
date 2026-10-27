import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  typeFindMany: vi.fn(),
  categoryFindMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    type: { findMany: mocks.typeFindMany },
    category: { findMany: mocks.categoryFindMany },
  },
}));

import {
  CATALOG_TERMS_TTL_MS,
  PRODUCT_NO_MATCH_REASONS,
  STATIC_TERM_INDEX,
  buildCatalogTermIndex,
  taxonomyCategoryIds,
  giftCategoryIds,
  categoryUrl,
  closestCategory,
  isKnownTerm,
  loadCatalogTermIndex,
  looksLikeCatalogQuery,
  parseAmount,
  parsePriceIntent,
  parseSearchIntent,
  relatedTerms,
  resetCatalogTermCache,
  storeSearchUrl,
  stripPriceWords,
} from "@/lib/whatsapp/search-intent";

describe("palabras de precio y topes", () => {
  it.each([
    ["marcadores baratos", null, "marcadores"],
    ["marcador barato", null, "marcador"],
    ["plumones económicos", null, "plumones"],
    ["plumones economicos", null, "plumones"],
    ["resaltadores baraticos", null, "resaltadores"],
    ["¿cuál es el más barato?", null, "¿cuál es?"],
    ["lo más económico en libretas", null, "en libretas"],
    ["marcadores a precio bajo", null, "marcadores"],
    ["cuadernos de menos de 10 mil", 10000, "cuadernos"],
    ["hasta 5.000", 5000, ""],
    ["máximo $8000", 8000, ""],
    ["maximo $8.000 en agendas", 8000, "en agendas"],
    ["stickers de menos de 10k", 10000, "stickers"],
    ["por debajo de $15.000 cuadernos", 15000, "cuadernos"],
    ["libretas de 12 mil o menos", 12000, "libretas"],
    ["cuadernos baratos hasta 20 mil", 20000, "cuadernos"],
  ])("«%s» → tope %s, busca «%s»", (body, maxPrice, rest) => {
    const r = parsePriceIntent(body);
    expect(r.price).toMatchObject({ sort: "cheapest", kind: maxPrice === null ? "cheapest" : "ceiling", maxPrice });
    expect(r.rest).toBe(rest);
  });

  it.each([
    "carpeta baja",
    "cartuchera de tela baja",
    "hasta 12 hojas",
    "cuaderno de 100 hojas",
    "hasta mañana",
    "tienen marcadores",
  ])("«%s» no habla de precio y queda igual", (body) => {
    expect(parsePriceIntent(body)).toEqual({ price: null, rest: body });
  });

  it("un número pelado y pequeño no es dinero; con $, mil o k sí", () => {
    expect(parseAmount("hasta 12")).toBeNull();
    expect(parseAmount("hasta $12")).toBe(12);
    expect(parseAmount("12 mil")).toBe(12000);
    expect(parseAmount("12k")).toBe(12000);
    expect(parseAmount("12 lucas")).toBe(12000);
    expect(parseAmount("12.500")).toBe(12500);
    expect(parseAmount("12000")).toBe(12000);
  });

  it("limpia una ranura del clasificador", () => {
    expect(stripPriceWords("barato")).toBeNull();
    expect(stripPriceWords("rosado barato")).toBe("rosado");
    expect(stripPriceWords("baja")).toBe("baja");
    expect(stripPriceWords(null)).toBeNull();
  });
});

describe("familias de WhatsApp", () => {
  it("marcador, plumón y rotulador incluyen resaltadores y micropuntas, en singular o plural", () => {
    for (const t of ["marcador", "marcadores", "plumón", "plumones", "plumon", "rotuladores"]) {
      expect(relatedTerms(t)).toEqual(["resaltador", "micropunta", "punta fina"]);
    }
  });

  it("es en un solo sentido: los resaltadores no traen marcadores", () => {
    expect(relatedTerms("resaltadores")).toEqual([]);
    expect(relatedTerms("micropuntas")).toEqual(["punta fina"]);
  });

  it("colores también son lápices de colores", () => {
    expect(relatedTerms("colores")).toEqual(["lápices de colores", "lápiz de color"]);
  });
});

describe("términos del catálogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCatalogTermCache();
  });

  const index = buildCatalogTermIndex(
    [{ name: "✏️ Escritura" }, { name: "Accesorios" }],
    [
      { name: "🖍️ Marcadores", slug: "marcadores" },
      { name: "Bolsos pequeños", slug: "bolsos-pequenos" },
      { name: "Rosa pastel", slug: "rosa-pastel" },
      { name: "Sin slug", slug: "" },
    ],
  );

  it("reconoce tipos y categorías sin icono, sin tildes y en plural", () => {
    expect(isKnownTerm(index, "escritura")).toBe(true);
    expect(isKnownTerm(index, "Marcadores")).toBe(true);
    expect(isKnownTerm(index, "bolsos")).toBe(true);
    expect(isKnownTerm(index, "accesorio")).toBe(true);
  });

  it("no reconoce adjetivos genéricos ni colores de los nombres", () => {
    expect(isKnownTerm(index, "pequeño")).toBe(false);
    expect(isKnownTerm(index, "pequeños")).toBe(false);
    expect(isKnownTerm(index, "rosa")).toBe(false);
    expect(isKnownTerm(index, "pastel")).toBe(false);
  });

  it("los sinónimos y las familias se reconocen sin base", () => {
    for (const t of ["marcadores", "plumones", "resaltadores", "micropuntas", "libretas", "colores", "lapiceros"]) {
      expect(isKnownTerm(STATIC_TERM_INDEX, t)).toBe(true);
    }
    expect(isKnownTerm(STATIC_TERM_INDEX, "regalar")).toBe(false);
    expect(isKnownTerm(STATIC_TERM_INDEX, "hola")).toBe(false);
  });

  it("se leen una vez por tienda y se guardan unos minutos", async () => {
    mocks.typeFindMany.mockResolvedValue([{ name: "Escritura" }]);
    mocks.categoryFindMany.mockResolvedValue([{ name: "Marcadores", slug: "marcadores" }]);
    const t0 = 1_000_000;
    const a = await loadCatalogTermIndex("tienda-1", t0);
    const b = await loadCatalogTermIndex("tienda-1", t0 + CATALOG_TERMS_TTL_MS - 1);
    expect(b).toBe(a);
    expect(mocks.typeFindMany).toHaveBeenCalledTimes(1);
    await loadCatalogTermIndex("tienda-1", t0 + CATALOG_TERMS_TTL_MS + 1);
    expect(mocks.typeFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.typeFindMany).toHaveBeenCalledWith({
      where: { storeId: "tienda-1", isArchived: false },
      select: { id: true, name: true },
    });
  });

  it("si la base falla, sigue con los términos estáticos", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.typeFindMany.mockRejectedValue(new Error("sin base"));
    mocks.categoryFindMany.mockResolvedValue([]);
    const r = await loadCatalogTermIndex("tienda-2");
    expect(r).toBe(STATIC_TERM_INDEX);
    expect(isKnownTerm(r, "marcadores")).toBe(true);
  });

  it("la categoría más cercana cuenta sinónimos y familias; sin slug no cuenta", () => {
    expect(closestCategory(index, ["plumones"])?.slug).toBe("marcadores");
    expect(closestCategory(index, ["resaltador"])).toBeNull();
    expect(closestCategory(index, ["bolsa"])?.slug).toBe("bolsos-pequenos");
    expect(closestCategory(index, ["mantel", "plastico"])).toBeNull();
  });
});

describe("la taxonomía manda cuando la palabra ES un tipo o una categoría", () => {
  const index = buildCatalogTermIndex(
    [
      { id: "t-cuad", name: "📒 Cuadernos" },
      { id: "t-of", name: "Oficina" },
      { id: "t-lc", name: "Lápices & Colores" },
    ],
    [
      { id: "c-cos", name: "Cosidos", slug: "cosidos", typeId: "t-cuad" },
      { id: "c-arg", name: "Argollados", slug: "argollados", typeId: "t-cuad" },
      { id: "c-let", name: "Cuadernos de lettering", slug: "lettering", typeId: "t-of" },
      { id: "c-blo", name: "Blocks de papel", slug: "blocks", typeId: "t-of" },
      { id: "c-col", name: "Colores", slug: "colores", typeId: "t-lc" },
      { id: "c-gra", name: "Grafitos", slug: "grafitos", typeId: "t-lc" },
    ],
  );

  it("«cuadernos» → el tipo entero y la categoría que empieza así, no «Blocks de papel»", () => {
    for (const t of ["cuadernos", "cuaderno"]) {
      const r = taxonomyCategoryIds(index, t);
      expect(r?.exact).toBe(true);
      expect(r?.ids.sort()).toEqual(["c-arg", "c-cos", "c-let"]);
    }
  });

  it("«colores» → la categoría exacta; «lápices» → el tipo «Lápices & Colores»", () => {
    expect(taxonomyCategoryIds(index, "colores")).toEqual({ ids: ["c-col"], exact: true });
    const lapices = taxonomyCategoryIds(index, "lápices");
    expect(lapices?.exact).toBe(false);
    expect(lapices?.ids.sort()).toEqual(["c-col", "c-gra"]);
  });

  it("los sinónimos no cuentan aquí, y sin coincidencia es null", () => {
    expect(taxonomyCategoryIds(index, "libretas")).toBeNull();
    expect(taxonomyCategoryIds(index, "papel")).toBeNull();
    expect(taxonomyCategoryIds(STATIC_TERM_INDEX, "cuadernos")).toBeNull();
  });
});

describe("el portero por términos", () => {
  const q = (body: string) => looksLikeCatalogQuery(parseSearchIntent(body, STATIC_TERM_INDEX));

  it.each(["marcadores baratos", "resaltadores", "plumones económicos", "cuadernos de menos de 10 mil", "colores baratos"])(
    "«%s» pasa sin verbo",
    (body) => expect(q(body)).toBe(true),
  );

  it.each([
    "hola buenas",
    "gracias!!",
    "ya hice la transferencia ayer en la tarde",
    "gracias por los stickers",
    "ya llegaron los cuadernos",
    "me encantó la libreta",
  ])(
    "«%s» no pasa",
    (body) => expect(q(body)).toBe(false),
  );

  // Desde el 27 de octubre, sin palabra de producto se busca en todo el
  // catálogo (o en lo de regalo): estos sí pasan.
  it.each(["algo barato para regalar", "algo barato", "tengo 20 mil para un regalo", "qué tienen económico"])(
    "«%s» pasa sin palabra de producto",
    (body) => expect(q(body)).toBe(true),
  );

  it("una conversación larga que nombra un artículo no pasa; con precio sí", () => {
    expect(q("mi hija dice que el cuaderno le llegó con una hoja rota")).toBe(false);
    expect(q("mi hija necesita para el colegio cuadernos de menos de 10 mil")).toBe(true);
  });

  it("«carpeta baja» es una carpeta: sin precio, con las dos palabras", () => {
    const p = parseSearchIntent("carpeta baja", STATIC_TERM_INDEX);
    expect(p.price).toBeNull();
    expect(p.tokens).toEqual(["carpeta", "baja"]);
    expect(p.allKnown).toBe(false);
  });

  it("«lo más barato que tengan de colores» busca solo «colores»", () => {
    const p = parseSearchIntent("lo más barato que tengan de colores", STATIC_TERM_INDEX);
    expect(p.query).toBe("colores");
    expect(p.allKnown).toBe(true);
  });
});

describe("enlaces y motivos", () => {
  it("apuntan a la tienda de producción, con el parámetro que lee /tienda", () => {
    expect(storeSearchUrl("mantel plástico")).toBe("https://papeleriapdepapel.com/tienda?search=mantel%20pl%C3%A1stico");
    expect(categoryUrl("marcadores")).toBe("https://papeleriapdepapel.com/categoria/marcadores");
  });

  it("los motivos son los seis que se archivan", () => {
    expect(PRODUCT_NO_MATCH_REASONS).toEqual([
      "no_signal",
      "few_tokens",
      "zero_results",
      "filtered_out",
      "classifier_failed",
      "classifier_other",
    ]);
  });
});

describe("lo de regalo, por nombre", () => {
  it("el tipo «Kits» entero y las categorías «regal…», nunca las de empaques", () => {
    const index = buildCatalogTermIndex(
      [
        { id: "t-kits", name: "🎁 Kits" },
        { id: "t-of", name: "Oficina" },
      ],
      [
        { id: "c-esc", name: "Kits escolares", slug: "kits-escolares", typeId: "t-kits" },
        { id: "c-reg", name: "Kits para regalar o regalarse", slug: "kits-regalar", typeId: "t-of" },
        { id: "c-emp", name: "Empaques para regalo", slug: "empaques", typeId: "t-of" },
        { id: "c-cua", name: "Cuadernos", slug: "cuadernos", typeId: "t-of" },
      ],
    );
    expect(giftCategoryIds(index)?.sort()).toEqual(["c-esc", "c-reg"]);
  });

  it("sin nada de regalo es null", () => {
    expect(giftCategoryIds(STATIC_TERM_INDEX)).toBeNull();
  });
});
