import { describe, expect, it } from "vitest";

import {
  COLOR_SWATCH_TYPES,
  contrastAgainstWhite,
  getSwatchPaint,
  parseHexColor,
  resolveSwatchType,
} from "@/lib/color-swatch";

const LIGHT_RING = "inset 0 0 0 1.5px rgba(15, 23, 42, 0.38)";
const RING = "inset 0 0 0 1px rgba(15, 23, 42, 0.14)";
const paintKey = (type: unknown, value: string) => {
  const { backgroundColor, backgroundImage, ring, glowColor } = getSwatchPaint(type, value);
  return JSON.stringify({ backgroundColor, backgroundImage, ring, glowColor });
};

describe("color-swatch", () => {
  it("falls back to SOLID for a missing or unknown type (never derived from the name)", () => {
    expect(resolveSwatchType(undefined)).toBe("SOLID");
    expect(resolveSwatchType(null)).toBe("SOLID");
    expect(resolveSwatchType("GLITTER")).toBe("SOLID");
    expect(resolveSwatchType("NEON")).toBe("NEON");
    expect(getSwatchPaint(undefined, "#0004FF")).toMatchObject({ type: "SOLID", backgroundColor: "#0004ff" });
  });

  it("regression #3: Multicolor (#FFFFFF) and Blanco (#FFFFFF) paint differently", () => {
    expect(paintKey("MULTICOLOR", "#ffffff")).not.toBe(paintKey("SOLID", "#ffffff"));
    expect(getSwatchPaint("MULTICOLOR", "#ffffff").backgroundImage).toContain("conic-gradient");
    expect(getSwatchPaint("SOLID", "#ffffff").backgroundImage).toBeUndefined();
  });

  it("gives each of the seven types its own paint for the same white value", () => {
    const keys = COLOR_SWATCH_TYPES.map((type) => paintKey(type, "#FFFFFF"));
    expect(new Set(keys).size).toBe(COLOR_SWATCH_TYPES.length);
    expect(paintKey("MULTICOLOR_PASTEL", "#ffffff")).not.toBe(paintKey("MULTICOLOR", "#ffffff"));
  });

  it("treats a white neon or metallic as assorted, and a coloured one as a finish of that hex", () => {
    expect(getSwatchPaint("NEON", "#ffffff")).toMatchObject({ assorted: true });
    expect(getSwatchPaint("NEON", "#ffffff").backgroundImage).toContain("#ff2fd0 0 34%");
    expect(getSwatchPaint("METALLIC", "#FFF")).toMatchObject({ assorted: true });
    const neon = getSwatchPaint("NEON", "#ea3b68");
    expect(neon).toMatchObject({ assorted: false, backgroundColor: "#ea3b68", glowColor: "rgba(234, 59, 104, 0.7)" });
    const gold = getSwatchPaint("METALLIC", "#FFD700");
    expect(gold.backgroundColor).toBe("#ffd700");
    expect(gold.backgroundImage).toMatch(/^linear-gradient\(135deg, #ffffff 0%, #ffd700 30%, #8c7600 55%/);
  });

  it("never needs color-mix(): the solid hex is always declared as the fallback", () => {
    for (const type of COLOR_SWATCH_TYPES) {
      for (const value of ["#ffffff", "#2b5b99"]) {
        const paint = getSwatchPaint(type, value);
        expect(paint.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
        expect(`${paint.backgroundImage ?? ""} ${paint.glowColor ?? ""}`).not.toContain("color-mix");
      }
    }
  });

  it("reinforces the inner border of solids below 3:1 against white", () => {
    expect(getSwatchPaint("SOLID", "#ffffff").ring).toBe(LIGHT_RING); // Blanco 1,00
    expect(getSwatchPaint("SOLID", "#f7fab2").ring).toBe(LIGHT_RING); // Amarillo pastel 1,09
    expect(getSwatchPaint("SOLID", "#FF8000").ring).toBe(LIGHT_RING); // Naranja 2,52
    expect(getSwatchPaint("SOLID", "#239B56").ring).toBe(RING); // Verde 3,56
    expect(getSwatchPaint("SOLID", "#000000").ring).toBe(RING);
  });

  it("measures WCAG contrast against white like the audit table", () => {
    expect(contrastAgainstWhite("#000000")).toBeCloseTo(21, 2);
    expect(contrastAgainstWhite("#ffffff")).toBeCloseTo(1, 2);
    expect(contrastAgainstWhite("#0004FF")).toBeCloseTo(8.53, 1);
    expect(contrastAgainstWhite("#b9afee")).toBeCloseTo(2.01, 1);
    expect(contrastAgainstWhite("rosa")).toBeNull();
  });

  it("shows an unknown swatch for an invalid hex where the hex is needed", () => {
    expect(getSwatchPaint("SOLID", "")).toMatchObject({ unknown: true, ring: LIGHT_RING });
    expect(getSwatchPaint("PATTERN", "nada")).toMatchObject({ unknown: true });
    // Multicolor y Transparente no usan el hex.
    expect(getSwatchPaint("MULTICOLOR", "")).toMatchObject({ unknown: false });
    expect(getSwatchPaint("TRANSPARENT", "")).toMatchObject({ unknown: false, backgroundSize: "100% 100%, 10px 10px" });
  });

  it("parses #RGB, #RRGGBB and #RRGGBBAA", () => {
    expect(parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHexColor(" #8E44AD ")).toEqual({ r: 142, g: 68, b: 173 });
    expect(parseHexColor("#8E44AD80")).toEqual({ r: 142, g: 68, b: 173 });
    expect(parseHexColor("#12")).toBeNull();
  });
});
