import { describe, expect, it } from "vitest";

import { matchAnalysisBrand } from "@/lib/product-image-analysis";

const brands = [
  { id: "brand-kiut", name: "Kiut", aliases: [] },
  { id: "brand-scribe", name: "Scribe", aliases: [] },
  { id: "brand-incolors", name: "Incolors", aliases: [], parentBrandId: "brand-scribe" },
  { id: "brand-klipp", name: "Klipp", aliases: ["Fashion"] },
  { id: "brand-norma", name: "Norma", aliases: null },
];

describe("matchAnalysisBrand", () => {
  it("maps the brand read on the photo to the store brand with the same name", () => {
    expect(matchAnalysisBrand("KIUT", brands)).toEqual({
      brandId: "brand-kiut",
      brandName: "Kiut",
      brandSource: "existing",
    });
  });

  it("maps through an alias and answers with the brand's own name", () => {
    expect(matchAnalysisBrand("Fashion", brands)).toEqual({
      brandId: "brand-klipp",
      brandName: "Klipp",
      brandSource: "existing",
    });
  });

  it("maps a line by its own name, and prefers the line when the photo says both", () => {
    expect(matchAnalysisBrand("Incolors", brands).brandId).toBe("brand-incolors");
    expect(matchAnalysisBrand("Scribe Incolors", brands).brandId).toBe("brand-incolors");
  });

  it("finds a brand contained in a longer text read by the model", () => {
    expect(matchAnalysisBrand("Kiut Colombia", brands).brandId).toBe("brand-kiut");
  });

  it("reports a brand that is not in the store, without creating or guessing one", () => {
    expect(matchAnalysisBrand("Stabilo", brands)).toEqual({
      brandId: null,
      brandName: null,
      brandSource: "not_found",
    });
    expect(matchAnalysisBrand("Normandía", brands).brandSource).toBe("not_found");
  });

  it("does not choose when the text names two brands", () => {
    expect(matchAnalysisBrand("Kiut y Norma", brands)).toMatchObject({ brandId: null, brandSource: "not_found" });
  });

  it("has nothing to map without a brand", () => {
    expect(matchAnalysisBrand(null, brands)).toEqual({ brandId: null, brandName: null, brandSource: null });
  });
});
