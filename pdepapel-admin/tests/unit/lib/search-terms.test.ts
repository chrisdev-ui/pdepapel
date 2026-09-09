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
