import {
  MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
  PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS,
  PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT,
  PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX,
  getProductImageAnalysisCacheKey,
  getProductImageAnalysisDay,
  getProductImageAnalysisRateLimitKey,
  isSupportedProductImageUrl,
  sanitizeProductImageAnalysis,
  type ProductImageAnalysisOutput,
} from "@/lib/product-image-analysis";
import { mergeProductCatalogAttributes } from "@/lib/product-catalog-attributes";
import { describe, expect, it } from "vitest";

const taxonomy = {
  categories: [
    { id: "category-notebooks", name: "Cuadernos", typeName: "Útiles" },
  ],
  sizes: [{ id: "size-a5", name: "A5", value: "A5" }],
  colors: [{ id: "color-pastel", name: "Pastel", value: "#F8B4C7" }],
  designs: [{ id: "design-classic", name: "Clásico" }],
};

function createOutput(
  overrides: Partial<ProductImageAnalysisOutput> = {},
): ProductImageAnalysisOutput {
  return {
    suggestedBaseName: "Troquel de figuras en maletín x8 de 1 cm",
    suggestedNameOptions: ["Troquel de figuras en maletín x8 de 1 cm"],
    suggestedDescription: null,
    brand: null,
    categoryName: null,
    categoryIsDeterministic: false,
    sizeName: null,
    sizeIsDeterministic: false,
    colorName: null,
    colorHex: null,
    colorIsDeterministic: false,
    designName: null,
    designIsDeterministic: false,
    gtin: null,
    mpn: null,
    variantRecommendation: {
      shouldCreateVariants: false,
      axes: [],
      evidence: null,
    },
    variantCandidates: [],
    catalogAttributes: [],
    observations: [],
    limitations: [],
    quantity: null,
    material: null,
    tip: null,
    measurements: null,
    model: null,
    keywords: [],
    fieldEvidence: {},
    ...overrides,
  };
}

describe("product image analysis helpers", () => {
  it("accepts only secure Cloudinary catalog images", () => {
    expect(
      isSupportedProductImageUrl(
        "https://res.cloudinary.com/pdepapel/image/upload/v1/producto.webp",
      ),
    ).toBe(true);
    expect(
      isSupportedProductImageUrl("http://res.cloudinary.com/image.jpg"),
    ).toBe(false);
    expect(isSupportedProductImageUrl("https://example.com/image.jpg")).toBe(
      false,
    );
  });

  it("uses Colombia's calendar day for a per-store rate limit key", () => {
    const date = new Date("2026-08-22T03:30:00.000Z");

    expect(getProductImageAnalysisDay(date)).toBe("2026-08-21");
    expect(getProductImageAnalysisRateLimitKey("store-id", date)).toBe(
      "store:store-id:product-image-analysis:2026-08-21",
    );
    expect(PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT).toBe(20);
    expect(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES).toBe(10);
    expect(PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS).toBe(60 * 60 * 24);
    expect(PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX).toBe(3);
  });

  it("uses a stable cache key only for the same images and taxonomy", () => {
    const input = {
      imageUrls: [
        "https://res.cloudinary.com/pdepapel/image/upload/v1/segunda.webp",
        "https://res.cloudinary.com/pdepapel/image/upload/v1/primera.webp",
      ],
      categoryName: "Cuadernos",
      ...taxonomy,
    };

    expect(getProductImageAnalysisCacheKey("store-id", input)).toBe(
      getProductImageAnalysisCacheKey("store-id", { ...input, imageUrls: [...input.imageUrls] }),
    );
    // La evidencia nombra fotos por su número: otro orden es otra propuesta.
    expect(getProductImageAnalysisCacheKey("store-id", input)).not.toBe(
      getProductImageAnalysisCacheKey("store-id", {
        ...input,
        imageUrls: [...input.imageUrls].reverse(),
      }),
    );
    expect(getProductImageAnalysisCacheKey("store-id", input)).not.toBe(
      getProductImageAnalysisCacheKey("store-id", {
        ...input,
        imageUrls: [...input.imageUrls, "https://res.cloudinary.com/pdepapel/image/upload/v1/tercera.webp"],
      }),
    );
    expect(
      getProductImageAnalysisCacheKey("store-id", {
        ...input,
        categories: [
          { id: "category-agendas", name: "Agendas", typeName: "Útiles" },
        ],
      }),
    ).not.toBe(getProductImageAnalysisCacheKey("store-id", input));
    expect(
      getProductImageAnalysisCacheKey("store-id", {
        ...input,
        sizes: [{ id: "size-a4", name: "A4", value: "A4" }],
      }),
    ).not.toBe(getProductImageAnalysisCacheKey("store-id", input));
  });

  it("applies only exact existing taxonomy options", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        suggestedDescription: "  Incluye ocho troqueles dentro de un estuche. ",
        brand: "  Kawaii  ",
        categoryName: "cuadernos",
        categoryIsDeterministic: true,
        sizeName: "A5",
        sizeIsDeterministic: true,
        colorName: "pastel",
        colorHex: "#F9D7E5",
        colorIsDeterministic: false,
        designName: "Clásico",
        designIsDeterministic: true,
        observations: ["  Se observan ocho troqueles en un estuche. "],
        limitations: [" No se distingue una marca en el empaque. "],
      }),
      taxonomy,
    );

    expect(analysis).toMatchObject({
      suggestedBaseName: "Troquel de figuras en maletín x8 de 1 cm",
      suggestedDescription:
        "<p>Incluye ocho troqueles dentro de un estuche.</p>",
      brand: "Kawaii",
      categoryId: "category-notebooks",
      categoryName: "Cuadernos",
      categorySource: "existing",
      sizeId: "size-a5",
      sizeName: "A5",
      sizeSource: "existing",
      colorId: null,
      colorName: null,
      colorSource: "not_detected",
      designId: "design-classic",
      designName: "Clásico",
      designSource: "existing",
    });
  });

  it("keeps safe rich description formatting and removes unsafe markup", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        suggestedDescription:
          '<p>Set de troqueles.</p><h3>Contenido visible</h3><ul><li><strong>8 piezas</strong></li></ul><script>alert("x")</script>',
      }),
      taxonomy,
    );

    expect(analysis.suggestedDescription).toContain(
      "<h3>Contenido visible</h3>",
    );
    expect(analysis.suggestedDescription).toContain(
      "<ul><li><strong>8 piezas</strong></li></ul>",
    );
    expect(analysis.suggestedDescription).not.toContain("<script");
  });

  it("merges approved customer features without deleting existing ones", () => {
    expect(
      mergeProductCatalogAttributes(
        [
          {
            key: "material",
            name: "Material",
            value: "Plástico",
            evidence: "Característica guardada en el catálogo",
          },
          {
            key: "formato",
            name: "Formato",
            value: "Carta",
            evidence: "Característica guardada en el catálogo",
          },
        ],
        [
          {
            key: "Formato",
            name: "Formato",
            value: "A5",
            evidence: "El empaque indica A5.",
          },
          {
            key: "cantidad",
            name: "Cantidad",
            value: "12 hojas",
            evidence: "La etiqueta indica 12 hojas.",
          },
        ],
      ),
    ).toEqual([
      {
        key: "material",
        name: "Material",
        value: "Plástico",
        evidence: "Característica guardada en el catálogo",
      },
      {
        key: "Formato",
        name: "Formato",
        value: "A5",
        evidence: "El empaque indica A5.",
      },
      {
        key: "cantidad",
        name: "Cantidad",
        value: "12 hojas",
        evidence: "La etiqueta indica 12 hojas.",
      },
    ]);
  });

  it("does not apply an ambiguous or unknown category or size", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        categoryName: "Papelería creativa",
        categoryIsDeterministic: true,
        sizeName: "Grande",
        sizeIsDeterministic: true,
      }),
      {
        ...taxonomy,
        categories: [
          { id: "category-a", name: "Accesorios", typeName: "Kawaii" },
          { id: "category-b", name: "Accesorios", typeName: "Oficina" },
        ],
        sizes: [
          { id: "size-a", name: "Grande", value: "L" },
          { id: "size-b", name: "Grande", value: "XL" },
        ],
      },
    );

    expect(analysis.categoryId).toBeNull();
    expect(analysis.categorySource).toBe("not_detected");
    expect(analysis.categoryAlternatives).toEqual([]);
    expect(analysis.sizeId).toBeNull();
    expect(analysis.sizeSource).toBe("not_detected");
    expect(analysis.sizeAlternatives).toEqual([
      expect.objectContaining({ id: "size-a", name: "Grande" }),
      expect.objectContaining({ id: "size-b", name: "Grande" }),
    ]);
  });

  it("recognizes the canonical noun of a category and offers close designs before creating a new one", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        categoryName: "Troquel",
        categoryIsDeterministic: true,
        designName: "Florales",
        designIsDeterministic: true,
      }),
      {
        ...taxonomy,
        categories: [
          {
            id: "category-dies",
            name: "Troqueles",
            typeName: "Journal / Scrap",
          },
        ],
        designs: [{ id: "design-floral", name: "Floral" }],
      },
    );

    expect(analysis.categoryId).toBe("category-dies");
    expect(analysis.categoryName).toBe("Troqueles");
    expect(analysis.designId).toBeNull();
    expect(analysis.designAlternatives).toEqual([
      { id: "design-floral", name: "Floral" },
    ]);
  });

  it("matches an existing category beyond the first 100 taxonomy options", () => {
    const categories = [
      ...Array.from({ length: 103 }, (_, index) => ({
        id: `category-${index}`,
        name: `Categoría ${String(index).padStart(3, "0")}`,
        typeName: "Catálogo",
      })),
      {
        id: "category-dies",
        name: "Troqueles",
        typeName: "Journal / Scrap",
      },
    ];
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        categoryName: "Troqueles",
        categoryIsDeterministic: true,
      }),
      { ...taxonomy, categories },
    );

    expect(analysis).toMatchObject({
      categoryId: "category-dies",
      categoryName: "Troqueles",
      categorySource: "existing",
    });
  });

  it("keeps a deterministic new color or design as a proposal without inventing an ID", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        suggestedBaseName: "Mini impresora térmica portátil",
        colorName: "Rosa pastel",
        colorHex: "#F5B7C6",
        colorIsDeterministic: true,
        designName: "Gatito kawaii",
        designIsDeterministic: true,
        observations: ["La carcasa es rosa pastel y muestra un gatito."],
      }),
      taxonomy,
    );

    expect(analysis).toMatchObject({
      colorName: "Rosa pastel",
      colorHex: "#F5B7C6",
      colorId: null,
      colorSource: "new",
      designName: "Gatito kawaii",
      designId: null,
      designSource: "new",
    });
  });

  it("keeps concise commercial name alternatives and fixes inverted common terms", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        suggestedBaseName: "Pad mouse con personajes surtidos",
        suggestedNameOptions: [
          "Pad mouse con personajes surtidos",
          "Mouse pad con personajes surtidos",
          "Alfombrilla para mouse con personajes surtidos",
        ],
      }),
      taxonomy,
    );

    expect(analysis.suggestedBaseName).toBe(
      "Mouse pad con personajes surtidos",
    );
    expect(analysis.suggestedNameOptions).toEqual([
      "Mouse pad con personajes surtidos",
      "Alfombrilla para mouse con personajes surtidos",
    ]);
  });

  it("accepts only checksum-valid visual GTINs and complete visible MPNs", () => {
    const accepted = sanitizeProductImageAnalysis(
      createOutput({
        gtin: {
          value: "4006381333931",
          evidence: "Se lee bajo el código de barras del empaque.",
        },
        mpn: {
          value: "SAN-AGENDA-A5",
          evidence: "Aparece completo junto a la referencia del fabricante.",
        },
      }),
      taxonomy,
    );
    const rejected = sanitizeProductImageAnalysis(
      createOutput({
        gtin: {
          value: "4006381333932",
          evidence: "Se lee bajo el código de barras del empaque.",
        },
        mpn: {
          value: "?",
          evidence: "No se lee completa.",
        },
      }),
      taxonomy,
    );

    expect(accepted.gtin).toEqual({
      value: "4006381333931",
      evidence: "Se lee bajo el código de barras del empaque.",
    });
    expect(accepted.mpn).toEqual({
      value: "SAN-AGENDA-A5",
      evidence: "Aparece completo junto a la referencia del fabricante.",
    });
    expect(rejected.gtin).toBeNull();
    expect(rejected.mpn).toBeNull();
  });

  it("keeps a variant suggestion as a review-only recommendation", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        variantRecommendation: {
          shouldCreateVariants: true,
          axes: ["COLOR", "SIZE"],
          evidence:
            "Las fotos muestran opciones comprables por color y tamaño.",
        },
        variantCandidates: [
          {
            imageIndex: 0,
            colorName: "Pastel",
            colorHex: "#F8B4C7",
            colorIsDeterministic: true,
            designName: "Clásico",
            designIsDeterministic: true,
            sizeName: "A5",
            sizeIsDeterministic: true,
            evidence: "Primera opción pastel.",
          },
          {
            imageIndex: 1,
            colorName: "Rosa",
            colorHex: "#F9C3D3",
            colorIsDeterministic: true,
            designName: "Clásico",
            designIsDeterministic: true,
            sizeName: "A5",
            sizeIsDeterministic: true,
            evidence: "Segunda opción rosa.",
          },
        ],
      }),
      taxonomy,
    );

    expect(analysis.variantRecommendation).toEqual({
      shouldCreateVariants: true,
      axes: ["COLOR", "SIZE"],
      evidence: "Las fotos muestran opciones comprables por color y tamaño.",
    });
    expect(analysis.variantCandidates).toEqual([
      expect.objectContaining({
        imageIndex: 0,
        colorId: "color-pastel",
        designId: "design-classic",
        sizeId: "size-a5",
      }),
      expect.objectContaining({
        imageIndex: 1,
        colorName: "Rosa",
        colorSource: "new",
        designId: "design-classic",
      }),
    ]);
  });

  it("keeps cached analyses from before variant candidates as review-only", () => {
    const legacyOutput = createOutput({
      variantRecommendation: {
        shouldCreateVariants: true,
        axes: ["COLOR"],
        evidence: "Las fotos parecen mostrar opciones distintas.",
      },
    }) as Partial<ProductImageAnalysisOutput>;
    delete legacyOutput.variantCandidates;

    const analysis = sanitizeProductImageAnalysis(
      legacyOutput as ProductImageAnalysisOutput,
      taxonomy,
    );

    expect(analysis.variantCandidates).toEqual([]);
    expect(analysis.variantRecommendation).toEqual({
      shouldCreateVariants: false,
      axes: [],
      evidence: null,
    });
  });
});

describe("reglas de la ficha propuesta", () => {
  it("nombres dentro de la gramática: ≤60 por palabra, sin barras, marca en Title Case", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        suggestedBaseName: "Cuaderno argollado NORMA 5 materias cuadriculado grande Let's Fly Away",
        suggestedNameOptions: ["Sketchbook / Bitácora William Morris diseño Van Gogh"],
      }),
      taxonomy,
    );
    expect(analysis.suggestedNameOptions).toEqual([
      "Cuaderno argollado Norma 5 materias cuadriculado grande",
      "Sketchbook William Morris diseño Van Gogh",
    ]);
    expect(analysis.suggestedNameOptions.every((name) => name.length <= 60)).toBe(true);
  });

  it("una licencia nunca queda como marca: pasa a diseño; la marca real va en Title Case", () => {
    const licence = sanitizeProductImageAnalysis(createOutput({ brand: "Sanrio" }), taxonomy);
    expect(licence.brand).toBeNull();
    expect(licence.designName).toBe("Sanrio");
    expect(licence.designSource).toBe("new");
    const maker = sanitizeProductImageAnalysis(createOutput({ brand: "GIPAO" }), taxonomy);
    expect(maker.brand).toBe("Gipao");
  });

  it("la descripción no abre con adjetivos de venta", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({ suggestedDescription: "<p>Lindo set de notas adhesivas. Hermoso empaque en caja.</p>" }),
      taxonomy,
    );
    expect(analysis.suggestedDescription).toBe("<p>Set de notas adhesivas. Empaque en caja.</p>");
  });

  it("cantidad, material, punta, medidas y modelo llegan como características con su formato", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        quantity: { value: 12, mixed: "colores" },
        material: "Plástico",
        tip: "Pincel",
        measurements: "14 × 1 cm",
        model: "Profesional",
      }),
      taxonomy,
    );
    expect(analysis.catalogAttributes.map((attribute) => [attribute.name, attribute.value])).toEqual([
      ["Cantidad", "12 colores"],
      ["Material", "Plástico"],
      ["Punta", "Pincel"],
      ["Medidas", "14 × 1 cm"],
      ["Modelo", "Profesional"],
    ]);
    const identical = sanitizeProductImageAnalysis(createOutput({ quantity: { value: 10, mixed: null } }), taxonomy);
    expect(identical.catalogAttributes[0]).toMatchObject({ name: "Cantidad", value: "x10" });
  });

  it("confianza y fotos de evidencia por campo, sin números de foto inventados", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        brand: "Scribe",
        fieldEvidence: { brand: { confidence: "alta", photos: [0, 4, 12] } },
        keywords: ["plumones", "marcadores", "plumones"],
      }),
      { ...taxonomy, photoCount: 7 },
    );
    expect(analysis.fieldEvidence.brand).toEqual({ confidence: "alta", photos: [0, 4] });
    expect(analysis.keywords).toEqual(["plumones", "marcadores"]);
  });

  it("variantes con fotos de la 0 a la 9", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({
        variantRecommendation: { shouldCreateVariants: true, axes: ["DESIGN"], evidence: "Cuatro diseños" },
        variantCandidates: [8, 9].map((imageIndex) => ({
          imageIndex,
          colorName: null,
          colorHex: null,
          colorIsDeterministic: false,
          designName: imageIndex === 8 ? "Perrito" : "Conejito",
          designIsDeterministic: true,
          sizeName: null,
          sizeIsDeterministic: false,
          evidence: null,
        })),
      }),
      taxonomy,
    );
    expect(analysis.variantCandidates.map((candidate) => candidate.imageIndex)).toEqual([8, 9]);
  });
});

describe("subcategoría: nombre exacto, nunca el sustantivo", () => {
  const catalog = {
    ...taxonomy,
    categories: [
      { id: "cat-cartucheras", name: "Cartucheras", typeName: "Organización" },
      { id: "cat-bisturies", name: "Bisturíes", typeName: "Oficina" },
      { id: "cat-libretas", name: "Libretas", typeName: "Papelería" },
      { id: "cat-colorear", name: "Libros de colorear", typeName: "Arte" },
      { id: "cat-planeadores", name: "Planeadores", typeName: "Papelería" },
      { id: "cat-lapiceros", name: "Bolígrafos / Lapiceros", typeName: "Escritura" },
    ],
  };
  const withCategory = (categoryName: string, name = "Cartuchera transparente") =>
    sanitizeProductImageAnalysis(
      createOutput({ categoryName, categoryIsDeterministic: true, suggestedBaseName: name, suggestedNameOptions: [name] }),
      catalog,
    );

  it.each([
    ["Cartuchera", "cat-cartucheras", "Cartucheras"],
    ["Bisturí", "cat-bisturies", "Bisturíes"],
    ["Libreta", "cat-libretas", "Libretas"],
    ["Libro para colorear", "cat-colorear", "Libros de colorear"],
  ])("«%s» se reconoce como la subcategoría existente", (answer, id, name) => {
    const analysis = withCategory(answer);
    expect(analysis.categoryId).toBe(id);
    expect(analysis.categoryName).toBe(name);
    expect(analysis.categorySource).toBe("existing");
  });

  it("una subcategoría desconocida sigue siendo propuesta nueva", () => {
    expect(withCategory("Globos").categoryId).toBeNull();
  });

  it("corrige un error de una letra en el sustantivo inicial y deja lo demás", () => {
    expect(withCategory("Libros de colorear", "Libre para colorear Formas Futuro").suggestedBaseName).toBe("Libro para colorear Formas Futuro");
    expect(withCategory("Bisturíes", "Bisturi mini retráctil").suggestedBaseName).toBe("Bisturí mini retráctil");
    expect(withCategory("Bisturíes", "Mini impresora térmica").suggestedBaseName).toBe("Mini impresora térmica");
  });

  it("un sinónimo del sustantivo pasa al canónico de la subcategoría", () => {
    expect(withCategory("Planeadores", "Planificador diario diseño Stitch").suggestedBaseName).toBe("Planeador diario diseño Stitch");
    expect(withCategory("Bolígrafos / Lapiceros", "Set de bolígrafos de gel 10 colores").suggestedBaseName).toBe("Set de lapiceros de gel 10 colores");
    expect(withCategory("Planeadores", "Libreta diaria").suggestedBaseName).toBe("Libreta diaria");
  });
});

describe("caché y nombre actual", () => {
  it("el nombre actual del producto cambia la llave: respalda la cantidad propuesta", () => {
    const base = { imageUrls: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"], ...taxonomy };
    expect(getProductImageAnalysisCacheKey("store", { ...base, currentName: "Set x12" })).not.toBe(
      getProductImageAnalysisCacheKey("store", { ...base, currentName: "Set 24 colores" }),
    );
  });
});

describe("aviso cuando la IA propone otro tipo de producto", () => {
  const catalog = {
    ...taxonomy,
    categories: [
      { id: "cat-oficina", name: "Herramientas de oficina", typeName: "Oficina" },
      { id: "cat-lamparas", name: "Lámparas", typeName: "Hogar" },
      { id: "cat-lapiceros", name: "Bolígrafos / Lapiceros", typeName: "Escritura" },
      { id: "cat-colorear", name: "Libros de colorear", typeName: "Arte" },
    ],
  };
  const analyze = (name: string, categoryName: string, current: { name?: string; categoryName?: string }) =>
    sanitizeProductImageAnalysis(
      createOutput({ suggestedBaseName: name, suggestedNameOptions: [name], categoryName, categoryIsDeterministic: true }),
      { ...catalog, current },
    );

  it("Impresora → Lámpara: avisa y no lo cambia en silencio", () => {
    const analysis = analyze("Lámpara kawaii", "Lámparas", { name: "Impresora térmica mini", categoryName: "Herramientas de oficina" });
    expect(analysis.typeWarning).toBe("La IA sugiere otro tipo de producto: revisa antes de aplicar.");
  });

  it("Bolígrafo → Lapicero es un sinónimo: sin aviso", () => {
    expect(analyze("Lapicero semi gel azul", "Bolígrafos / Lapiceros", { name: "Bolígrafo azul de gel" }).typeWarning).toBeNull();
    expect(analyze("Lapicero semi gel azul", "Bolígrafos / Lapiceros", { name: "Bolígrafo azul", categoryName: "Bolígrafos / Lapiceros" }).typeWarning).toBeNull();
  });

  it("Libre → Libro es un error de letra corregido: sin aviso", () => {
    const analysis = analyze("Libre para colorear Formas Futuro", "Libros de colorear", { name: "Cuaderno para colorear «Colorear para crecer»", categoryName: "Libros de colorear" });
    expect(analysis.suggestedBaseName).toBe("Libro para colorear Formas Futuro");
    expect(analysis.typeWarning).toBeNull();
  });

  it("sustantivo desconocido y sin subcategoría reconocible: avisa (Washi → «Set de tizas»)", () => {
    const analysis = sanitizeProductImageAnalysis(
      createOutput({ suggestedBaseName: "Set de tizas de colores x6", suggestedNameOptions: ["Set de tizas de colores x6"] }),
      { ...catalog, categories: [...catalog.categories, { id: "cat-washi", name: "Washi tape", typeName: "Decoración" }], current: { name: "Washi pastel x6", categoryName: "Washi tape" } },
    );
    expect(analysis.typeWarning).toBe("La IA sugiere otro tipo de producto: revisa antes de aplicar.");
  });

  it("sustantivo desconocido pero la subcategoría propuesta es la actual: sin aviso (Mini impresora)", () => {
    expect(
      analyze("Mini impresora térmica Kawaii", "Herramientas de oficina", { name: "Impresora térmica mini", categoryName: "Herramientas de oficina" }).typeWarning,
    ).toBeNull();
  });

  it("un producto nuevo, sin nombre ni subcategoría, no se compara con nada", () => {
    expect(analyze("Lámpara kawaii", "Lámparas", {}).typeWarning).toBeNull();
  });
});
