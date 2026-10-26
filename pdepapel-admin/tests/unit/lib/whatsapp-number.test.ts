import { describe, expect, it } from "vitest";

import { formatWhatsappNumber, normalizeWhatsappNumber } from "@/lib/whatsapp-number";

describe("WhatsApp del negocio", () => {
  it.each([
    ["300 000 0000", "573000000000"],
    ["+57 300 000 0000", "573000000000"],
    ["573000000000", "573000000000"],
    ["(300) 000-0000", "573000000000"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toBe(expected);
  });

  it.each(["", null, undefined, "6041234567", "30000000", "1 300 000 0000"])("%s no es un celular colombiano", (input) => {
    expect(normalizeWhatsappNumber(input as string | null | undefined)).toBeNull();
  });

  it("se muestra como se lee", () => {
    expect(formatWhatsappNumber("573000000000")).toBe("300 000 0000");
  });
});
