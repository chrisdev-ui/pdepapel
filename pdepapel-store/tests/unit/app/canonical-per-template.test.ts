import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, "../../../app", path), "utf8");

/**
 * Cada plantilla indexable declara su propia canónica. El layout raíz ya no
 * pone «/» por defecto: antes los 404 (y cualquier página nueva que olvidara
 * la suya) le decían a Google que eran el inicio.
 */
describe("canonical per template", () => {
  it("the root layout does not set a default canonical", () => {
    expect(read("layout.tsx")).not.toMatch(/canonical:/);
  });

  it.each([
    ["(routes)/page.tsx", /canonical: "\/"/],
    ["(routes)/tienda/page.tsx", /alternates: \{ canonical: canonicalUrl \}/],
    ["(routes)/categoria/[slug]/page.tsx", /canonical/],
    ["(routes)/producto/[slug]/page.tsx", /alternates: \{ canonical: canonicalPath \}/],
    ["(routes)/nosotros/page.tsx", /canonical: STOREFRONT_ROUTES\.about/],
    ["(routes)/contacto/page.tsx", /canonical/],
    ["(routes)/politicas/devoluciones/page.tsx", /canonical/],
    ["(routes)/politicas/envios/page.tsx", /canonical/],
    ["(routes)/politicas/privacidad/page.tsx", /canonical/],
    ["(routes)/tarjeta-regalo/page.tsx", /canonical/],
    ["(routes)/proximamente/page.tsx", /canonical: "\/proximamente"/],
    ["(routes)/boletin/[slug]/page.tsx", /canonical: `\$\{BASE_URL\}\/boletin\/\$\{issue\.slug\}`/],
  ])("%s declares its own canonical", (path, pattern) => {
    expect(read(path)).toMatch(pattern);
  });
});
