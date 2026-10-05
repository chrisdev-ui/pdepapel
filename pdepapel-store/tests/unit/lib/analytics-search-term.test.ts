import { describe, expect, it } from "vitest";

import { SEARCH_TERM_MAX_LENGTH, sanitizeSearchTerm } from "@/lib/analytics-search-term";

describe("sanitizeSearchTerm", () => {
  it("lowercases and collapses spaces so the same search counts once", () => {
    expect(sanitizeSearchTerm("  Cuaderno   5 MATERIAS ")).toBe("cuaderno 5 materias");
    expect(sanitizeSearchTerm("Útiles ÁNIME")).toBe("útiles ánime");
  });

  it("keeps ordinary product searches, numbers included", () => {
    expect(sanitizeSearchTerm("resma carta x500 hojas")).toBe("resma carta x500 hojas");
    expect(sanitizeSearchTerm("colores x24 2026")).toBe("colores x24 2026");
  });

  it("caps the term at 100 characters", () => {
    const term = sanitizeSearchTerm("a".repeat(150));
    expect(term).toHaveLength(SEARCH_TERM_MAX_LENGTH);
  });

  it.each([
    ["an email", "ana.perez@gmail.com"],
    ["an email inside a query", "pedido de laura@correo.co"],
    ["a mobile number", "3001234567"],
    ["a phone with spaces", "+57 300 123 4567"],
    ["a phone with dashes", "604-444-55-66"],
    ["a national id", "1.036.789.123"],
  ])("drops %s (GA4 forbids personal data)", (_label, raw) => {
    expect(sanitizeSearchTerm(raw)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(sanitizeSearchTerm("")).toBeNull();
    expect(sanitizeSearchTerm("   ")).toBeNull();
    expect(sanitizeSearchTerm(undefined)).toBeNull();
  });
});
