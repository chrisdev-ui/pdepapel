import { iconNames } from "lucide-react/dynamic";
import { describe, expect, it } from "vitest";

import { sanitizeIconSvg } from "@/lib/svg-icon";
import {
  CURATED_TAXONOMY_ICONS,
  isLucideIconName,
  normalizeSearchText,
  parseTaxonomyIconBody,
  resolveFallbackIconName,
  searchIconNames,
  SPANISH_ICON_SYNONYMS,
  stripLeadingSymbol,
} from "@/lib/taxonomy-icons";

describe("CURATED_TAXONOMY_ICONS", () => {
  it("has 16 unique entries that all exist in Lucide", () => {
    expect(CURATED_TAXONOMY_ICONS).toHaveLength(16);
    const names = CURATED_TAXONOMY_ICONS.map((item) => item.name);
    expect(new Set(names).size).toBe(16);
    const known = new Set<string>(iconNames);
    for (const name of names) expect(known.has(name), name).toBe(true);
    expect(names).toContain("tag");
    for (const item of CURATED_TAXONOMY_ICONS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  it("only maps to real Lucide names in the Spanish dictionary", () => {
    const known = new Set<string>(iconNames);
    for (const [spanish, english] of Object.entries(SPANISH_ICON_SYNONYMS)) {
      for (const name of english) expect(known.has(name), `${spanish} → ${name}`).toBe(true);
    }
    expect(Object.keys(SPANISH_ICON_SYNONYMS).length).toBeGreaterThanOrEqual(60);
  });
});

describe("searchIconNames", () => {
  it("finds scissors for tijeras and is case and accent insensitive", () => {
    expect(searchIconNames("tijeras", iconNames)[0]).toBe("scissors");
    expect(searchIconNames("TIJERAS", iconNames)[0]).toBe("scissors");
    expect(searchIconNames("Lápiz", iconNames)).toContain("pencil");
    expect(searchIconNames("corazón", iconNames)[0]).toBe("heart");
  });

  it("matches Lucide names directly, caps the results and returns nothing for an empty query", () => {
    expect(searchIconNames("notebook-pen", iconNames)[0]).toBe("notebook-pen");
    expect(searchIconNames("arrow", iconNames, 48)).toHaveLength(48);
    expect(searchIconNames("   ", iconNames)).toEqual([]);
    expect(searchIconNames("zzzzqqq", iconNames)).toEqual([]);
  });

  it("puts curated icons first when their Spanish label matches", () => {
    expect(searchIconNames("cuadernos", iconNames)[0]).toBe("notebook-pen");
  });
});

describe("helpers", () => {
  it("normalises text and strips leading symbols", () => {
    expect(normalizeSearchText("  Útiles Escolares ")).toBe("utiles escolares");
    expect(stripLeadingSymbol("🎨 Creatividad & Juego")).toBe("Creatividad & Juego");
    expect(stripLeadingSymbol("Útiles")).toBe("Útiles");
  });

  it("validates Lucide names by pattern only", () => {
    expect(isLucideIconName("notebook-pen")).toBe(true);
    expect(isLucideIconName("NotebookPen")).toBe(false);
    expect(isLucideIconName("a")).toBe(false);
    expect(isLucideIconName("<svg>")).toBe(false);
  });

  it("resolves the keyword fallback like the storefront", () => {
    expect(resolveFallbackIconName({ slug: "escritura", name: "🖊️ Escritura" })).toBe("pen-line");
    expect(resolveFallbackIconName({ name: "Bolsos & Morrales" })).toBe("backpack");
    expect(resolveFallbackIconName({ name: "Algo nuevo" })).toBe("tag");
  });
});

describe("parseTaxonomyIconBody", () => {
  it("keeps absent keys, clears empty values and normalises names", () => {
    expect(parseTaxonomyIconBody({}, sanitizeIconSvg)).toEqual({ ok: true, icon: undefined, iconSvg: undefined });
    expect(parseTaxonomyIconBody({ icon: "", iconSvg: null }, sanitizeIconSvg)).toEqual({ ok: true, icon: null, iconSvg: null });
    expect(parseTaxonomyIconBody({ icon: " Gift " }, sanitizeIconSvg)).toEqual({ ok: true, icon: "gift", iconSvg: undefined });
  });

  it("rejects bad names and unsafe markup, and sanitises good markup", () => {
    expect(parseTaxonomyIconBody({ icon: "Not a name" }, sanitizeIconSvg).ok).toBe(false);
    expect(parseTaxonomyIconBody({ iconSvg: "<script>x</script>" }, sanitizeIconSvg).ok).toBe(false);
    expect(parseTaxonomyIconBody({ iconSvg: '<svg><path stroke="red" d="M1 1"/></svg>' }, sanitizeIconSvg)).toEqual({
      ok: true,
      icon: undefined,
      iconSvg: '<path d="M1 1"/>',
    });
  });
});
