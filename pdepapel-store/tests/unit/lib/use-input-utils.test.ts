import { DIGIT_REGEX, LETTER_REGEX } from "@/constants";
import {
  generateMaskValue,
  generateRawValue,
  getMaskedValueFromRaw,
} from "@/lib/use-input-utils";
import { describe, expect, it } from "vitest";

describe("input-mask helpers", () => {
  it("formats valid raw input while preserving the mask literals", () => {
    expect(getMaskedValueFromRaw("AA-999", "AB123")).toBe("AB-123");
    expect(
      generateRawValue("AA-999", "AB123", LETTER_REGEX, DIGIT_REGEX, "_"),
    ).toEqual({ maskValue: "AB-123", rawValue: "AB123" });
  });

  it("rejects raw input that does not match the mask", () => {
    expect(
      generateRawValue("AA-999", "A1123", LETTER_REGEX, DIGIT_REGEX, "_"),
    ).toEqual({ maskValue: "__-___", rawValue: "" });
  });

  it("extracts a valid masked value and rejects invalid literals", () => {
    expect(
      generateMaskValue("AA-999", "AB-123", LETTER_REGEX, DIGIT_REGEX, "_"),
    ).toEqual({ maskValue: "AB-123", rawValue: "AB123" });
    expect(
      generateMaskValue("AA-999", "AB 123", LETTER_REGEX, DIGIT_REGEX, "_"),
    ).toEqual({ maskValue: "__-___", rawValue: "" });
  });
});
