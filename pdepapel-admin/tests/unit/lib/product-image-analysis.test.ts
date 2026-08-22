import { describe, expect, it } from "vitest";

import {
  MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
  PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT,
  buildProductImageAnalysisPrompt,
  getProductImageAnalysisDay,
  getProductImageAnalysisRateLimitKey,
  isSupportedProductImageUrl,
  sanitizeProductImageAnalysis,
} from "@/lib/product-image-analysis";

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
    expect(PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT).toBe(12);
    expect(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES).toBe(3);
  });

  it("matches deterministic attributes already configured by this store", () => {
    const analysis = sanitizeProductImageAnalysis(
      {
        suggestedBaseName: "  Troquel de figuras en maletín x8 de 1 cm ",
        brand: "  Kawaii  ",
        colorName: "pastel",
        colorHex: "#F9D7E5",
        colorIsDeterministic: false,
        designName: "Clásico",
        designIsDeterministic: true,
        observations: ["  Se observan ocho troqueles en un estuche. "],
        limitations: [" No se distingue una marca en el empaque. "],
      },
      {
        colors: [{ id: "color-pastel", name: "Pastel" }],
        designs: [{ id: "design-classic", name: "Clásico" }],
      },
    );

    expect(analysis).toMatchObject({
      suggestedBaseName: "Troquel de figuras en maletín x8 de 1 cm",
      brand: "Kawaii",
      colorId: null,
      colorName: null,
      colorSource: "not_detected",
      designId: "design-classic",
      designName: "Clásico",
      designSource: "existing",
    });
  });

  it("keeps a deterministic new color or design as a proposal without inventing an ID", () => {
    const analysis = sanitizeProductImageAnalysis(
      {
        suggestedBaseName: "Mini impresora térmica portátil",
        brand: null,
        colorName: "Rosa pastel",
        colorHex: "#F5B7C6",
        colorIsDeterministic: true,
        designName: "Gatito kawaii",
        designIsDeterministic: true,
        observations: ["La carcasa es rosa pastel y muestra un gatito."],
        limitations: [],
      },
      {
        colors: [{ id: "color-rosa", name: "Rosa", value: "#F8B4C7" }],
        designs: [{ id: "design-floral", name: "Floral" }],
      },
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

  it("requires visual evidence and catalog options in its model instructions", () => {
    const prompt = buildProductImageAnalysisPrompt({
      categoryName: "Troqueles",
      colors: ["Rosa"],
      designs: ["Floral"],
    });

    expect(prompt).toContain("Nunca adivines");
    expect(prompt).toContain("No incluyas marca, color, diseño");
    expect(prompt).toContain("proponer un nuevo nombre corto");
    expect(prompt).toContain("Rosa");
    expect(prompt).toContain("Floral");
  });
});
