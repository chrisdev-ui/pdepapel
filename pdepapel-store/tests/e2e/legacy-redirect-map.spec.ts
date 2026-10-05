import { expect, test } from "./helpers/safe-test";

import { legacyProductRedirects } from "../../lib/legacy-product-redirects.mjs";

/**
 * El mapa de `middleware.ts` se congeló el 2026-08-24 y para octubre tenía
 * destinos renombrados (cadenas) y archivados (308 → 404). Esto falla en
 * cuanto un destino deja de ser una ficha viva: hay que rehacer el mapa con
 * `npx tsx --env-file=.env scripts/export-product-slug-redirects.ts
 * --store-id=<tienda>` en pdepapel-admin.
 *
 * Corre una sola vez (proyecto chromium). El sitemap lista exactamente las
 * fichas vivas con su URL canónica: un destino que no está ahí es un 404 o
 * una redirección. Pedir las ~800 fichas una por una costaba más de 10 minutos
 * de renders en producción; una muestra confirma que el sitemap dice la verdad.
 */
const SAMPLE_SIZE = 20;

const pathsInSitemap = (xml: string) =>
  new Set(Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), ([, url]) => new URL(url).pathname));

const sampleOf = <T,>(items: T[], size: number) =>
  items.filter((_, index) => index % Math.max(1, Math.ceil(items.length / size)) === 0);

test.describe("mapa de redirecciones de producto", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "una sola pasada");
  });

  test("cada destino es una ficha viva del sitemap: sin 404 ni otra redirección", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const live = pathsInSitemap(await sitemap.text());
    const destinations = Array.from(new Set(legacyProductRedirects.map(({ destination }) => destination)));

    const missing = destinations.filter((destination) => !live.has(destination));
    expect(missing, `${missing.length} destinos que no son una ficha viva`).toEqual([]);

    for (const destination of sampleOf(destinations, SAMPLE_SIZE)) {
      const response = await request.get(destination, { maxRedirects: 0 });
      expect(response.status(), destination).toBe(200);
    }
  });

  test("una muestra de orígenes responde 308 hacia su destino exacto", async ({ request }) => {
    const sample = legacyProductRedirects.filter((_, index) => index % Math.ceil(legacyProductRedirects.length / 20) === 0);
    for (const { source, destination } of sample) {
      const response = await request.get(source, { maxRedirects: 0 });
      expect(response.status(), source).toBe(308);
      expect(new URL(response.headers().location ?? "", "https://papeleriapdepapel.com").pathname, source).toBe(destination);
    }
  });
});
