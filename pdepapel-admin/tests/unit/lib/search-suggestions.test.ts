import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildVocabulary, closestWord, editDistance, suggestQuery, tokenize } from "@/lib/search-suggestions";

const vocabulary = buildVocabulary([
  "Cuaderno 5 materias Snoopy A5 argollado",
  "Cuaderno cosido cuadriculado",
  "Resaltadores de lectura",
  "Agenda 2027 floral",
  "Stickers vintage",
  "📒 Cuadernos",
]);

describe("search suggestions", () => {
  it("tokenizes names without accents, emoji or short words", () => {
    expect(tokenize("Bolígrafo x2 kawaii")).toEqual(["boligrafo", "kawaii"]);
    expect(vocabulary.get("cuaderno")).toBe(2);
    expect(vocabulary.has("a5")).toBe(false);
  });

  it("measures typos including transpositions", () => {
    expect(editDistance("cuadeno", "cuaderno")).toBe(1);
    expect(editDistance("cuadreno", "cuaderno")).toBe(1);
    expect(editDistance("agenda", "agenda")).toBe(0);
    expect(editDistance("stikers", "stickers")).toBe(1);
  });

  it("finds the closest vocabulary word within a length-aware limit", () => {
    expect(closestWord("cuadeno", vocabulary)).toBe("cuaderno");
    expect(closestWord("resaltadres", vocabulary)).toBe("resaltadores");
    expect(closestWord("zzzzq", vocabulary)).toBeNull();
    expect(closestWord("agenda", vocabulary)).toBe("agenda");
  });

  it("corrects only misspelled words and keeps the rest", () => {
    expect(suggestQuery("cuadeno snoopy", vocabulary)).toBe("cuaderno snoopy");
    expect(suggestQuery("stikers vintge", vocabulary)).toBe("stickers vintage");
    expect(suggestQuery("cuaderno snoopy", vocabulary)).toBeNull();
    expect(suggestQuery("zzzzqqq", vocabulary)).toBeNull();
    expect(suggestQuery("  ", vocabulary)).toBeNull();
  });
});
