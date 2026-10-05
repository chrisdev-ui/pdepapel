import { describe, expect, it } from "vitest";

import { legacyProductRedirects } from "../../../lib/legacy-product-redirects.mjs";

describe("legacy product redirects", () => {
  it("contains unique product paths and points straight at the final product", () => {
    expect(legacyProductRedirects.length).toBeGreaterThan(0);
    expect(
      new Set(legacyProductRedirects.map(({ source }) => source)).size,
    ).toBe(legacyProductRedirects.length);
    // Antes: …amarillo-l → carpeta-van-gogh → (alias) …-verde, dos saltos.
    expect(legacyProductRedirects).toContainEqual({
      source: "/producto/carpeta-van-gogh-van-gogh-amarillo-l",
      destination: "/producto/carpeta-hermetica-carta-de-van-gogh-verde",
    });
    expect(
      legacyProductRedirects.every(
        ({ source, destination }) =>
          source.startsWith("/producto/") &&
          destination.startsWith("/producto/"),
      ),
    ).toBe(true);
  });

  /**
   * Una cadena (A→B y B→C) es un salto extra para Google y, si C cambia, un
   * 404. El mapa se rehace con `npm run` del exportador del panel y siempre
   * apunta al destino final.
   */
  it("has no chains: no destination is also a source, and no source points to itself", () => {
    const sources = new Set(legacyProductRedirects.map(({ source }) => source));
    const chains = legacyProductRedirects.filter(({ destination }) => sources.has(destination));
    expect(chains).toEqual([]);
    expect(legacyProductRedirects.filter(({ source, destination }) => source === destination)).toEqual([]);
  });
});
