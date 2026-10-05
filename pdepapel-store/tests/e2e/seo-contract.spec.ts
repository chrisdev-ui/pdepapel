import { expect, test } from "./helpers/safe-test";

/**
 * El contrato SEO de cada plantilla pública (P2-7, 2026-10-05): la URL
 * canónica, los datos estructurados que Google lee y la redirección de una
 * dirección vieja por id. Solo lecturas; la ficha sale del sitemap, así que
 * no depende de un producto concreto.
 *
 * Los alias de slug y el mapa de redirecciones viven en
 * `legacy-redirect-map.spec.ts`; el producto archivado, en
 * `public-catalog.spec.ts`.
 */

type JsonLd = Record<string, unknown> & { "@type"?: string };

const absolute = (path: string, base: string) => new URL(path, base).toString().replace(/\/$/, "");

const canonicalOf = (html: string) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

/** Cada bloque ld+json de la página, ya parseado; uno inválido hace fallar la prueba. */
const jsonLdOf = (html: string): JsonLd[] =>
  Array.from(html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g), ([, raw]) => {
    const data = JSON.parse(raw) as JsonLd | JsonLd[] | { "@graph": JsonLd[] };
    if (Array.isArray(data)) return data;
    return "@graph" in data ? (data["@graph"] as JsonLd[]) : [data as JsonLd];
  }).flat();

test.describe("contrato SEO de las plantillas públicas", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "el HTML es el mismo en móvil: una sola pasada");
  });
  test.setTimeout(2 * 60 * 1000);

  let productPath = "";

  test.beforeAll(async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const loc = sitemap.match(/<loc>([^<]*\/producto\/[^<]+)<\/loc>/)?.[1];
    expect(loc, "el sitemap no trae ninguna ficha").toBeTruthy();
    productPath = new URL(loc!).pathname;
  });

  test("cada plantilla declara su propia URL canónica, sin parámetros", async ({ request, baseURL }) => {
    const base = baseURL!;
    const pages: [string, string][] = [
      ["/", "/"],
      ["/tienda", "/tienda"],
      ["/categoria/boligrafos-lapiceros", "/categoria/boligrafos-lapiceros"],
      [productPath, productPath],
      [`${productPath}?utm_source=e2e&utm_medium=prueba`, productPath],
      ["/nosotros", "/nosotros"],
      ["/politicas/envios", "/politicas/envios"],
    ];
    for (const [path, expected] of pages) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(canonicalOf(await response.text()), path).toBe(absolute(expected, base));
    }
  });

  test("los datos estructurados son JSON válido y traen lo que Google pide", async ({ request, baseURL }) => {
    const base = baseURL!;

    const home = jsonLdOf(await (await request.get("/")).text());
    expect(home.map((item) => item["@type"])).toEqual(expect.arrayContaining(["Organization", "WebSite"]));

    const category = jsonLdOf(await (await request.get("/categoria/boligrafos-lapiceros")).text());
    expect(category.map((item) => item["@type"])).toEqual(expect.arrayContaining(["BreadcrumbList", "ItemList"]));

    const product = jsonLdOf(await (await request.get(productPath)).text());
    const item = product.find((entry) => entry["@type"] === "Product");
    expect(item, productPath).toBeTruthy();
    expect(item).toMatchObject({ url: absolute(productPath, base), name: expect.any(String) });
    expect(Array.isArray(item!.image) ? item!.image.length : item!.image ? 1 : 0, "imagen").toBeGreaterThan(0);
    const offer = item!.offers as Record<string, unknown>;
    expect(offer).toMatchObject({
      "@type": "Offer",
      priceCurrency: "COP",
      availability: expect.stringMatching(/^https:\/\/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder|LimitedAvailability)$/),
    });
    expect(Number(offer.price), "precio").toBeGreaterThan(0);

    const breadcrumb = product.find((entry) => entry["@type"] === "BreadcrumbList");
    const crumbs = (breadcrumb?.itemListElement as { item?: string }[] | undefined) ?? [];
    expect(crumbs.at(-1)?.item, "la miga final es la propia ficha").toBe(absolute(productPath, base));
  });

  test("una ficha pedida por su id viejo responde 308 a su slug en un salto", async ({ request }) => {
    const html = await (await request.get(productPath)).text();
    const id = html.match(/data-product-signals="([0-9a-f-]{36})"/)?.[1];
    expect(id, "la ficha ya no expone su id en data-product-signals").toBeTruthy();

    const response = await request.get(`/producto/${id}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location ?? "", "https://papeleriapdepapel.com").pathname).toBe(productPath);
  });
});
