import { describe, expect, it } from "vitest";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone";

describe("phone helpers", () => {
  it("normalizes Colombian national phone numbers to E.164", () => {
    expect(normalizePhone("3001234567")).toBe("+573001234567");
    expect(normalizePhone("(300) 123-4567")).toBe("+573001234567");
  });

  it("preserves valid international phone numbers", () => {
    expect(normalizePhone("+573001234567")).toBe("+573001234567");
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("preserves invalid legacy values instead of changing behavior", () => {
    expect(normalizePhone(" legacy-phone ")).toBe("legacy-phone");
    expect(formatPhoneNumber("legacy-phone")).toBe("legacy-phone");
  });
});
