import { describe, expect, it } from "vitest";

import { normalizePhoneForInput } from "@/lib/phone";

describe("normalizePhoneForInput", () => {
  it("normalizes Colombian national phone numbers", () => {
    expect(normalizePhoneForInput("3001234567")).toBe("+573001234567");
    expect(normalizePhoneForInput("(300) 123-4567")).toBe("+573001234567");
  });

  it("preserves valid international phone numbers", () => {
    expect(normalizePhoneForInput("+573001234567")).toBe("+573001234567");
    expect(normalizePhoneForInput("+14155552671")).toBe("+14155552671");
  });

  it("returns an empty value for missing or invalid phone numbers", () => {
    expect(normalizePhoneForInput(undefined)).toBe("");
    expect(normalizePhoneForInput("   ")).toBe("");
    expect(normalizePhoneForInput("1234")).toBe("");
  });
});
