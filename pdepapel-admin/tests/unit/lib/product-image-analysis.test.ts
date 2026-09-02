import {
  MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
  PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS,
  PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT,
  PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX,
  buildProductImageAnalysisPrompt,
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
    expect(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES).toBe(3);
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
      getProductImageAnalysisCacheKey("store-id", {
        ...input,
        imageUrls: [...input.imageUrls].reverse(),
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
    expect(analysis.sizeId).toBeNull();
    expect(analysis.sizeSource).toBe("not_detected");
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

  it("requires visual evidence and current catalog options in its model instructions", () => {
    const prompt = buildProductImageAnalysisPrompt({
      categoryName: "Troqueles",
      categories: ["Cuadernos (Útiles)"],
      sizes: ["A5"],
      colors: ["Rosa"],
      designs: ["Floral"],
    });

    expect(prompt).toContain("Nunca adivines");
    expect(prompt).toContain("No incluyas marca, color, diseño");
    expect(prompt).toContain("Cuadernos (Útiles)");
    expect(prompt).toContain("A5");
    expect(prompt).toContain("checksum GS1");
    expect(prompt).toContain("variantRecommendation");
    expect(prompt).toContain("mouse pad");
    expect(prompt).toContain("suggestedNameOptions");
    expect(prompt).toContain("HTML semántico");
    expect(prompt).toContain("<ul>");
  });
});
