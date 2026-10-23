import { describe, expect, it } from "vitest";

import { captionWords, jaccard, PIECE_MIN_JACCARD, pieceSuggestions, type PieceCandidate } from "@/lib/social/pieces";

const at = (hours: number) => new Date(Date.UTC(2026, 9, 20, 12) + hours * 3_600_000);
const candidate = (id: string, platform: "INSTAGRAM" | "TIKTOK", hours: number, caption: string | null, pieceId: string | null = null): PieceCandidate => ({ id, platform, postedAt: at(hours), caption, pieceId });

describe("la misma pieza en varias redes", () => {
  it("las palabras van sin tildes, mayúsculas, hashtags, menciones, enlaces ni palabras vacías", () => {
    expect(Array.from(captionWords("¡El KIT de Capibara para el colegio! #kawaii @pdepapel https://wa.me/57 ya llegó"))).toEqual(["kit", "capibara", "colegio", "llego"]);
    expect(captionWords(null).size).toBe(0);
  });

  it("Jaccard: palabras en común sobre todas las palabras; sin texto, 0", () => {
    expect(jaccard(new Set(["kit", "capibara", "colegio"]), new Set(["kit", "capibara", "colegio", "nuevo"]))).toBe(0.75);
    expect(jaccard(new Set(), new Set(["kit"]))).toBe(0);
    expect(PIECE_MIN_JACCARD).toBe(0.6);
  });

  it("sugiere solo otra red, a 48 h o menos, parecida y sin pieza; nunca une sola", () => {
    const posts = [
      candidate("ig", "INSTAGRAM", 0, "Kit de capibara para el colegio ✨ #kawaii"),
      candidate("tt", "TIKTOK", 30, "kit capibara colegio 🦫 #fyp"),
      candidate("tt-tarde", "TIKTOK", 50, "Kit de capibara para el colegio"),
      candidate("tt-otro", "TIKTOK", 2, "Stickers de gatitos para tu agenda"),
      candidate("ig-2", "INSTAGRAM", 1, "Kit de capibara para el colegio"),
      candidate("tt-unida", "TIKTOK", 3, "Kit de capibara para el colegio", "pieza-1"),
    ];
    const suggestions = pieceSuggestions(posts);
    expect(suggestions.get("ig")).toEqual(["tt"]);
    expect(suggestions.get("tt")).toEqual(["ig", "ig-2"]);
    expect(suggestions.has("tt-otro")).toBe(false);
    expect(suggestions.has("tt-unida")).toBe(false);
    expect(suggestions.get("ig-2")).toEqual(["tt"]);
  });

  it("sin texto no sugiere nada", () => {
    expect(pieceSuggestions([candidate("a", "INSTAGRAM", 0, null), candidate("b", "TIKTOK", 1, null)]).size).toBe(0);
  });
});
