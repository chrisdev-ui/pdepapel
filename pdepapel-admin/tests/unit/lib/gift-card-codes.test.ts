import { describe, expect, it } from "vitest";

import {
  GIFT_CARD_CODE_LENGTH,
  formatGiftCardCode,
  generateGiftCardCode,
  giftCardCodeLast4,
  hashGiftCardCode,
  normalizeGiftCardCode,
  parseGiftCardCode,
} from "@/lib/gift-card-codes";

describe("gift card codes", () => {
  it("generates PDP-XXXX-XXXX-XXXX codes from a confusion-free alphabet, all distinct", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = generateGiftCardCode();
      expect(code).toMatch(/^PDP-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(500);
  });

  it("normalizes what a customer types: case, spaces, dashes and the prefix", () => {
    expect(normalizeGiftCardCode(" pdp-abcd efgh-jkmn ")).toBe("ABCDEFGHJKMN");
    expect(normalizeGiftCardCode("ABCDEFGHJKMN")).toBe("ABCDEFGHJKMN");
    expect(normalizeGiftCardCode("PDP ABCD EFGH JKMN")).toBe("ABCDEFGHJKMN");
  });

  it("rejects anything that cannot be a code", () => {
    expect(normalizeGiftCardCode("")).toBeNull();
    expect(normalizeGiftCardCode(null)).toBeNull();
    expect(normalizeGiftCardCode("PDP-ABCD-EFGH")).toBeNull(); // corto
    expect(normalizeGiftCardCode("PDP-ABCD-EFGH-JKM0")).toBeNull(); // 0 no existe
    expect(normalizeGiftCardCode("PDP-ABCD-EFGH-JKMI")).toBeNull(); // I no existe
    expect(normalizeGiftCardCode("PDP-ABCD-EFGH-JKMNX")).toBeNull(); // largo
    expect(parseGiftCardCode("nada")).toBeNull();
  });

  it("hashes the canonical form so every spelling of one code lands on one row", () => {
    const a = parseGiftCardCode("pdp-abcd-efgh-jkmn");
    const b = parseGiftCardCode("ABCDEFGHJKMN");
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.hash).toHaveLength(64);
    expect(a!.hash).toBe(hashGiftCardCode("ABCDEFGHJKMN"));
    expect(a!.last4).toBe("JKMN");
    expect(giftCardCodeLast4("ABCDEFGHJKMN")).toBe("JKMN");
  });

  it("round-trips a generated code through the parser", () => {
    const code = generateGiftCardCode();
    const parsed = parseGiftCardCode(code);
    expect(parsed).not.toBeNull();
    expect(formatGiftCardCode(normalizeGiftCardCode(code)!)).toBe(code);
    expect(normalizeGiftCardCode(code)).toHaveLength(GIFT_CARD_CODE_LENGTH);
  });
});
