import { describe, expect, it } from "vitest";

import { normalizeProductIdentifiers } from "@/lib/product-identifiers";

describe("normalizeProductIdentifiers", () => {
  it("normalizes valid identifiers before persisting them", () => {
    expect(
      normalizeProductIdentifiers({
        gtin: " 7701234567890 ",
        mpn: " REF-001 ",
      }),
    ).toEqual({
      gtin: "7701234567890",
      mpn: "REF-001",
      hasNoProductIdentifier: false,
    });
  });

  it("clears identifiers when the product has none", () => {
    expect(
      normalizeProductIdentifiers({
        gtin: "7701234567890",
        mpn: "REF-001",
        hasNoProductIdentifier: true,
      }),
    ).toEqual({
      gtin: null,
      mpn: null,
      hasNoProductIdentifier: true,
    });
  });

  it("rejects invalid GTIN values", () => {
    expect(() => normalizeProductIdentifiers({ gtin: "ABC-123" })).toThrow(
      "El GTIN debe tener 8, 12, 13 o 14 dígitos",
    );
  });

  it("flags a new product without identifiers only when asked to default", () => {
    expect(normalizeProductIdentifiers({ gtin: "", mpn: "", defaultNoIdentifierWhenEmpty: true })).toEqual({
      gtin: null,
      mpn: null,
      hasNoProductIdentifier: true,
    });
    expect(normalizeProductIdentifiers({ gtin: "7701234567890", defaultNoIdentifierWhenEmpty: true })).toMatchObject({
      gtin: "7701234567890",
      hasNoProductIdentifier: false,
    });
    expect(normalizeProductIdentifiers({ mpn: "REF-1", defaultNoIdentifierWhenEmpty: true })).toMatchObject({
      mpn: "REF-1",
      hasNoProductIdentifier: false,
    });
    expect(normalizeProductIdentifiers({ hasNoProductIdentifier: false, defaultNoIdentifierWhenEmpty: true })).toMatchObject({
      hasNoProductIdentifier: false,
    });
    expect(normalizeProductIdentifiers({ gtin: "" })).toMatchObject({ hasNoProductIdentifier: false });
  });
});
