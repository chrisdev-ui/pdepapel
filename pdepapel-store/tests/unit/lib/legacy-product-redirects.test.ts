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

  /**
   * Los bloques de construcción se llamaban «Lego …» (marca registrada). Sus
   * siete URL viejas van directo al slug nuevo; el slug `lego-*` intermedio
   * quedó como alias del panel y sería un segundo salto.
   */
  it("sends the old Lego variant URLs straight to the renamed products", () => {
    const lego = legacyProductRedirects.filter(({ source }) => source.startsWith("/producto/lego-"));
    expect(lego).toEqual([
      { source: "/producto/lego-batman-animados-negro-xs", destination: "/producto/bloques-de-construccion-batman-negro" },
      { source: "/producto/lego-calamardo-animados-azul-xs", destination: "/producto/bloques-de-construccion-calamardo-azul" },
      { source: "/producto/lego-capitan-america-animados-azul-xs", destination: "/producto/bloques-de-construccion-capitan-america-azul" },
      { source: "/producto/lego-luigi-animados-verde-xs", destination: "/producto/bloques-de-construccion-luigi-verde" },
      { source: "/producto/lego-panda-osito-panda-negro-m", destination: "/producto/bloques-de-construccion-panda" },
      { source: "/producto/lego-psyduck-animados-amarillo-xs", destination: "/producto/bloques-de-construccion-psyduck" },
      { source: "/producto/lego-winnie-pooh-y-sus-amigos-armable-multicolor-s", destination: "/producto/bloques-de-construccion-winnie-pooh-y-sus-amigos" },
    ]);
    expect(legacyProductRedirects.filter(({ destination }) => /lego/i.test(destination))).toEqual([]);
  });
});
