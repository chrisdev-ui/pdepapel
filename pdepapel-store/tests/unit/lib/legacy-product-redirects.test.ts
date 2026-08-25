import { describe, expect, it } from "vitest";

import { legacyProductRedirects } from "../../../lib/legacy-product-redirects.mjs";

describe("legacy product redirects", () => {
  it("contains unique product paths and the migrated lacre product URL", () => {
    expect(legacyProductRedirects.length).toBeGreaterThan(0);
    expect(
      new Set(legacyProductRedirects.map(({ source }) => source)).size,
    ).toBe(legacyProductRedirects.length);
    expect(legacyProductRedirects).toContainEqual({
      source: "/producto/sello-lacre-amarillo-pastel-kawaii-s",
      destination: "/producto/sello-lacre-amarillo-pastel",
    });
    expect(
      legacyProductRedirects.every(
        ({ source, destination }) =>
          source.startsWith("/producto/") &&
          destination.startsWith("/producto/"),
      ),
    ).toBe(true);
  });
});
