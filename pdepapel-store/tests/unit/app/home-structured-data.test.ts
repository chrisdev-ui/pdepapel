import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Google retiró el cuadro de búsqueda de sitelinks y el destino de la
 * SearchAction (/tienda?search=) está bloqueado en robots.txt: anunciarla solo
 * apuntaba a una URL que Google no puede rastrear.
 */
describe("home structured data", () => {
  const source = readFileSync(join(__dirname, "../../../app/(routes)/page.tsx"), "utf8");

  it("does not declare a SearchAction", () => {
    expect(source).not.toMatch(/"@type": "SearchAction"|potentialAction:|search_term_string/);
  });

  it("still declares the WebSite node", () => {
    expect(source).toMatch(/"@type": "WebSite"/);
  });
});
