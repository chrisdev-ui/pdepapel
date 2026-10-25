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
          (/^\/producto\/[a-z0-9-]+(#producto-no-disponible)?$/.test(destination) ||
            /^\/categoria\/[a-z0-9-]+#producto-no-disponible$/.test(destination)),
      ),
    ).toBe(true);
  });

  /**
   * 27 orígenes apuntaban a fichas ya archivadas y hacían 308 → 308. Ninguno
   * se borra: el que perdió su ficha va en un salto a donde la mandaría la
   * ficha (hermana viva o categoría) con el aviso «ya no está disponible».
   */
  it("sends sources whose product was archived straight to the archived product's target", () => {
    expect(legacyProductRedirects.length).toBeGreaterThanOrEqual(1024);
    expect(legacyProductRedirects).toContainEqual({
      source: "/producto/cajita-de-sellos-capibara-capibara-amarillo-pastel-m",
      destination: "/categoria/sellos-decorativos#producto-no-disponible",
    });
    expect(legacyProductRedirects).toContainEqual({
      source: "/producto/agenda-acolchadita-animalitos-animalitos-pastel-m",
      destination: "/producto/agenda-acolchadita-maile-family-gris-animalitos#producto-no-disponible",
    });
  });

  /**
   * Una cadena (A→B y B→C) es un salto extra para Google y, si C cambia, un
   * 404. El mapa se rehace con `npm run` del exportador del panel y siempre
   * apunta al destino final.
   */
  it("has no chains: no destination is also a source, and no source points to itself", () => {
    const sources = new Set(legacyProductRedirects.map(({ source }) => source));
    const chains = legacyProductRedirects.filter(({ destination }) => sources.has(destination.split("#")[0]));
    expect(chains).toEqual([]);
    expect(legacyProductRedirects.filter(({ source, destination }) => source === destination)).toEqual([]);
  });

  /**
   * Los bloques de construcción se llamaban «Lego …» (marca registrada). Sus
   * siete URL viejas van directo al slug nuevo, igual que el slug `lego-*`
   * intermedio (alias del panel), sin pasar por él.
   */
  it("sends the old Lego variant URLs straight to the renamed products", () => {
    const lego = legacyProductRedirects.filter(({ source }) => source.startsWith("/producto/lego-"));
    // Desde 2026-10-25 también van los slugs `lego-*` intermedios (alias del panel), directo al final.
    expect(lego.every(({ destination }) => destination.startsWith("/producto/bloques-de-construccion-"))).toBe(true);
    expect(lego).toEqual(expect.arrayContaining([
      { source: "/producto/lego-batman-animados-negro-xs", destination: "/producto/bloques-de-construccion-batman-negro" },
      { source: "/producto/lego-calamardo-animados-azul-xs", destination: "/producto/bloques-de-construccion-calamardo-azul" },
      { source: "/producto/lego-capitan-america-animados-azul-xs", destination: "/producto/bloques-de-construccion-capitan-america-azul" },
      { source: "/producto/lego-luigi-animados-verde-xs", destination: "/producto/bloques-de-construccion-luigi-verde" },
      { source: "/producto/lego-panda-osito-panda-negro-m", destination: "/producto/bloques-de-construccion-panda" },
      { source: "/producto/lego-psyduck-animados-amarillo-xs", destination: "/producto/bloques-de-construccion-psyduck" },
      { source: "/producto/lego-winnie-pooh-y-sus-amigos-armable-multicolor-s", destination: "/producto/bloques-de-construccion-winnie-pooh-y-sus-amigos" },
      { source: "/producto/lego-winnie-pooh-y-sus-amigos", destination: "/producto/bloques-de-construccion-winnie-pooh-y-sus-amigos" },
    ]));
    expect(legacyProductRedirects.filter(({ destination }) => /lego/i.test(destination))).toEqual([]);
  });
});
