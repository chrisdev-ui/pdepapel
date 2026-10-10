import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  photoFactsSchema,
  analyzeProductImages,
  type AnalysisGenerate,
} from "@/lib/product-image-analysis-pipeline";
import {
  productImageAnalysisOutputSchema,
  sanitizeProductImageAnalysis,
} from "@/lib/product-image-analysis";

type Fixture = {
  provider: string;
  product: { currentName: string; categoryName: string; photos: number };
  calls: { kind: "facts" | "synthesis" | "category"; photos: number[]; output: unknown }[];
};

const dir = path.join(__dirname, "../../fixtures/product-image-analysis");
const fixtures = readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Fixture);

const categories = [
  { id: "cat-marcadores", name: "Marcadores", typeName: "Escritura" },
  { id: "cat-plumones", name: "Plumones", typeName: "Escritura" },
  { id: "cat-lapiceros", name: "Bolígrafos / Lapiceros", typeName: "Escritura" },
];
const lists = {
  categories: categories.map((category) => `${category.name} (${category.typeName})`),
  sizes: [],
  colors: [],
  designs: [],
};

describe.each(fixtures)("respuestas grabadas de $provider", (fixture) => {
  const replay: AnalysisGenerate = async (request) => {
    const call = fixture.calls.find(
      (entry) =>
        entry.kind === request.kind &&
        (request.kind !== "facts" || entry.photos.join() === request.photoNumbers.join()),
    );
    if (!call) throw new Error(`sin respuesta grabada para ${request.kind}`);
    return { output: call.output };
  };

  it("cumplen los mismos esquemas", () => {
    for (const call of fixture.calls.filter((entry) => entry.kind === "facts")) {
      expect(photoFactsSchema.safeParse(call.output).success).toBe(true);
    }
    const synthesis = fixture.calls.find((entry) => entry.kind === "synthesis")!;
    expect(productImageAnalysisOutputSchema.safeParse(synthesis.output).success).toBe(true);
  });

  it("pasan por la misma reconstrucción de cantidad, subcategoría y aviso de tipo", async () => {
    const run = await analyzeProductImages({
      imageUrls: Array.from(
        { length: fixture.product.photos },
        (_, index) => `https://res.cloudinary.com/demo/image/upload/v1/foto-${index}.jpg`,
      ),
      lists,
      generate: replay,
      currentName: fixture.product.currentName,
    });
    const analysis = sanitizeProductImageAnalysis(run.output, {
      categories,
      sizes: [],
      colors: [],
      designs: [],
      current: { name: fixture.product.currentName, categoryName: fixture.product.categoryName },
    });

    expect(run.photosRead).toHaveLength(fixture.product.photos);
    expect(analysis.suggestedBaseName).toMatch(/ 24 colores$/);
    expect(analysis.suggestedBaseName!.length).toBeLessThanOrEqual(60);
    expect(analysis.suggestedNameOptions.every((name) => !/\bx\d|30 colores/.test(name))).toBe(true);
    expect(analysis.brand).toBe("Scribe");
    expect(["cat-marcadores", "cat-plumones"]).toContain(analysis.categoryId);
    expect(analysis.typeWarning).toBeNull();
  });
});
