import { describe, expect, it } from "vitest";

import {
  BOX_MESSAGES,
  BOX_TYPES,
  boxFormSchema,
  boxInUseMessage,
  boxInputSchema,
  boxVolumeLiters,
  boxVolumetricWeightKg,
  describeBoxUsage,
  formatBoxDimensions,
  formatCm,
  formatKg,
  formatLiters,
  isValidBoxDimension,
  normalizeBoxName,
  parseMeasurement,
} from "@/lib/boxes";

const validBox = {
  name: "Caja mediana",
  type: "M",
  width: 33,
  height: 10,
  length: 20,
  isDefault: false,
};

describe("parseMeasurement", () => {
  it("accepts comma and dot decimals and trims spaces", () => {
    expect(parseMeasurement("12,5")).toBe(12.5);
    expect(parseMeasurement("12.5")).toBe(12.5);
    expect(parseMeasurement(" 20 ")).toBe(20);
    expect(parseMeasurement(7.5)).toBe(7.5);
  });

  it("returns undefined for empty or non numeric input", () => {
    expect(parseMeasurement("")).toBeUndefined();
    expect(parseMeasurement(",")).toBeUndefined();
    expect(parseMeasurement("abc")).toBeUndefined();
    expect(parseMeasurement("1e3")).toBeUndefined();
    expect(parseMeasurement(null)).toBeUndefined();
    expect(parseMeasurement(Number.NaN)).toBeUndefined();
  });
});

describe("boxInputSchema (API)", () => {
  it("parses a valid payload with numeric dimensions", () => {
    const parsed = boxInputSchema.safeParse(validBox);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(validBox);
  });

  it("accepts dimensions written with a comma and trims the name", () => {
    const parsed = boxInputSchema.safeParse({
      ...validBox,
      name: "  Caja kraft  ",
      width: "12,5",
      height: "10",
      length: "20.5",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.width).toBe(12.5);
      expect(parsed.data.length).toBe(20.5);
      expect(parsed.data.name).toBe("Caja kraft");
    }
  });

  it("rejects a side above 300 cm with the Spanish message", () => {
    const parsed = boxInputSchema.safeParse({ ...validBox, width: 300.5 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(BOX_MESSAGES.dimensionMax);
      expect(parsed.error.issues[0]?.path).toEqual(["width"]);
    }
  });

  it("rejects a side below 1 cm and more than one decimal", () => {
    const tooSmall = boxInputSchema.safeParse({ ...validBox, height: 0.5 });
    expect(tooSmall.success).toBe(false);
    if (!tooSmall.success) {
      expect(tooSmall.error.issues[0]?.message).toBe(BOX_MESSAGES.dimensionMin);
    }

    const tooPrecise = boxInputSchema.safeParse({ ...validBox, length: 20.25 });
    expect(tooPrecise.success).toBe(false);
    if (!tooPrecise.success) {
      expect(tooPrecise.error.issues[0]?.message).toBe(
        BOX_MESSAGES.dimensionDecimals,
      );
    }
  });

  it("requires every dimension and reports missing ones in Spanish", () => {
    const parsed = boxInputSchema.safeParse({ ...validBox, width: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        BOX_MESSAGES.dimensionRequired,
      );
    }
  });

  it("only accepts the five box types", () => {
    for (const type of BOX_TYPES) {
      expect(boxInputSchema.safeParse({ ...validBox, type }).success).toBe(true);
    }
    const parsed = boxInputSchema.safeParse({ ...validBox, type: "XXL" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(BOX_MESSAGES.typeInvalid);
    }
  });

  it("validates the name length", () => {
    expect(boxInputSchema.safeParse({ ...validBox, name: "   " }).success).toBe(
      false,
    );
    expect(
      boxInputSchema.safeParse({ ...validBox, name: "x".repeat(61) }).success,
    ).toBe(false);
    expect(
      boxInputSchema.safeParse({ ...validBox, name: "x".repeat(60) }).success,
    ).toBe(true);
  });

  it("coerces isDefault honestly: only true, 'true' and 1 mark a default", () => {
    const parse = (isDefault: unknown) => {
      const parsed = boxInputSchema.safeParse({ ...validBox, isDefault });
      return parsed.success ? parsed.data.isDefault : "invalid";
    };
    expect(parse(true)).toBe(true);
    expect(parse("true")).toBe(true);
    expect(parse(1)).toBe(true);
    expect(parse("false")).toBe(false);
    expect(parse(undefined)).toBe(false);
    expect(parse("yes")).toBe(false);
  });
});

describe("boxFormSchema (panel form)", () => {
  it("reports a missing measure with the required message", () => {
    const parsed = boxFormSchema.safeParse({ ...validBox, width: undefined });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        BOX_MESSAGES.dimensionRequired,
      );
    }
  });

  it("defaults isDefault to false", () => {
    const { isDefault: _ignored, ...withoutDefault } = validBox;
    const parsed = boxFormSchema.safeParse(withoutDefault);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isDefault).toBe(false);
  });
});

describe("box helpers", () => {
  it("isValidBoxDimension follows the same limits as the schema", () => {
    expect(isValidBoxDimension(1)).toBe(true);
    expect(isValidBoxDimension(300)).toBe(true);
    expect(isValidBoxDimension(12.5)).toBe(true);
    expect(isValidBoxDimension(0.9)).toBe(false);
    expect(isValidBoxDimension(300.1)).toBe(false);
    expect(isValidBoxDimension(12.55)).toBe(false);
    expect(isValidBoxDimension(undefined)).toBe(false);
    expect(isValidBoxDimension(Number.NaN)).toBe(false);
  });

  it("formats measures with es-CO decimals", () => {
    expect(formatCm(12.5)).toBe("12,5");
    expect(formatCm(20)).toBe("20");
    expect(formatBoxDimensions(12.5, 10, 20)).toBe("12,5 × 10 × 20 cm");
    expect(formatLiters(boxVolumeLiters(33, 10, 20))).toBe("6,6 L");
    expect(formatKg(boxVolumetricWeightKg(33, 10, 20))).toBe("1,32 kg");
  });

  it("normalizes names for a case-insensitive uniqueness check", () => {
    expect(normalizeBoxName("  Caja KRAFT ")).toBe(normalizeBoxName("caja kraft"));
  });

  it("explains usage in Spanish with correct plurals", () => {
    expect(describeBoxUsage(0)).toBe("sin envíos todavía");
    expect(describeBoxUsage(1)).toBe("usada en 1 envío");
    expect(describeBoxUsage(3)).toBe("usada en 3 envíos");
    expect(boxInUseMessage(1)).toContain("1 envío la usa");
    expect(boxInUseMessage(4)).toContain("4 envíos la usan");
    expect(boxInUseMessage(4)).toContain("predeterminada");
  });
});
