import { skipPrivacyBanner } from "../helpers/public-page";
import { expect, test, type Page } from "../helpers/safe-test";

/**
 * Marcas en la tienda: fila de marcas del catálogo, sección «Marca» de la hoja
 * de filtros, página de la marca (con productos y vacía), ficha del producto y
 * una marca oculta que no aparece en ningún lado. Datos por entorno; los que
 * faltan saltan su prueba.
 */
const BRAND_SLUG = process.env.E2E_BRAND_SLUG || "kiut";
const BRAND_NAME = process.env.E2E_BRAND_NAME || "Kiut";
const BRAND_PRODUCT_SLUG = process.env.E2E_BRAND_PRODUCT_SLUG || "lapicero-kiut-negro";
const EMPTY_BRAND_SLUG = process.env.E2E_EMPTY_BRAND_SLUG;
const HIDDEN_BRAND_SLUG = process.env.E2E_HIDDEN_BRAND_SLUG;
const HIDDEN_BRAND_NAME = process.env.E2E_HIDDEN_BRAND_NAME;
const HIDDEN_BRAND_PRODUCT_SLUG = process.env.E2E_HIDDEN_BRAND_PRODUCT_SLUG;
const PARENT_BRAND_SLUG = process.env.E2E_PARENT_BRAND_SLUG;
const PARENT_BRAND_NAME = process.env.E2E_PARENT_BRAND_NAME;
const LINE_BRAND_SLUG = process.env.E2E_LINE_BRAND_SLUG;
const LINE_BRAND_NAME = process.env.E2E_LINE_BRAND_NAME;

const grid = (page: Page) => page.locator('#catalog-results a[href^="/producto/"]');
const brandRow = (page: Page) => page.getByRole("navigation", { name: "Marcas" });
const brandChip = (page: Page, name: string) => brandRow(page).getByRole("link", { name, exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Filtros de productos" });
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function openListing(page: Page, path: string) {
  await open(page, path);
  await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Filtros", exact: true })).toBeEnabled({ timeout: 45_000 });
}

async function robots(page: Page) {
  return page.locator('meta[name="robots"]').getAttribute("content");
}

test.beforeEach(async ({ page }) => {
  await skipPrivacyBanner(page);
});

test.describe("catálogo", () => {
  test("la fila de marcas es la única señal de la marca: chip marcado, línea de resultados y «Quitar»", async ({ page }) => {
    await openListing(page, "/tienda");
    const chip = brandChip(page, BRAND_NAME);
    await expect(chip).toHaveAttribute("href", new RegExp(`marca=${BRAND_SLUG}`));
    await expect(chip).not.toHaveAttribute("aria-current", "true");
    await expect(brandRow(page).getByRole("link", { name: /Ver todas/ })).toHaveAttribute("href", "/marcas");
    // En el teléfono la fila se desliza de lado; nunca ensancha la página.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await chip.click();
    await expect.poll(() => param(page, "marca")).toBe(BRAND_SLUG);
    await expect(chip).toHaveAttribute("aria-current", "true");
    const quitar = page.getByRole("button", { name: "Quitar", exact: true }).filter({ visible: true }).first();
    await expect(quitar).toBeVisible();
    await expect(page.getByText(new RegExp(`productos? de ${BRAND_NAME}`)).filter({ visible: true }).first()).toBeVisible();
    // Filtrado por una sola marca, las tarjetas no repiten el nombre.
    await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("#catalog-results .card-brand").filter({ hasText: BRAND_NAME })).toHaveCount(0);

    await quitar.click();
    await expect.poll(() => param(page, "marca")).toBeNull();
    await expect(chip).not.toHaveAttribute("aria-current", "true");
  });

  test("la hoja de filtros trae «Marca» con casillas y conteos", async ({ page }) => {
    await openListing(page, "/tienda");
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await expect(sheet(page)).toBeVisible();
    const section = sheet(page).getByRole("button", { name: /^Marca/ });
    await expect(section).toBeVisible();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    const box = sheet(page).getByRole("checkbox", { name: BRAND_NAME, exact: true });
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    // La hoja aplica al pulsar «Ver N productos», como el resto de filtros.
    await sheet(page).getByRole("button", { name: /^Ver [\d.]+ productos?$/ }).click();
    await expect(sheet(page)).toBeHidden();
    await expect.poll(() => param(page, "marca")).toBe(BRAND_SLUG);
    await expect(brandChip(page, BRAND_NAME)).toHaveAttribute("aria-current", "true");
  });

  test("/tienda?marca= apunta su canónica a la página de la marca", async ({ page }) => {
    await openListing(page, `/tienda?marca=${BRAND_SLUG}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/marcas/${BRAND_SLUG}$`));
  });
});

test.describe("página de la marca", () => {
  test("cabecera, productos sin la línea de marca y migas", async ({ page }) => {
    // La página de la marca no tiene barra de filtros: basta con la cuadrícula.
    await open(page, `/marcas/${BRAND_SLUG}`);
    await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { level: 1, name: BRAND_NAME })).toBeVisible();
    await expect(page.locator("#catalog-results .card-brand").filter({ hasText: BRAND_NAME })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Marcas" }).first()).toHaveAttribute("href", "/marcas");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("el índice /marcas enlaza la marca", async ({ page }) => {
    await open(page, "/marcas");
    await expect(page.getByRole("link", { name: new RegExp(BRAND_NAME) }).first()).toHaveAttribute("href", `/marcas/${BRAND_SLUG}`);
  });

  test("marca sin productos: aviso, enlace al catálogo y noindex", async ({ page }) => {
    test.skip(!EMPTY_BRAND_SLUG, "sin E2E_EMPTY_BRAND_SLUG");
    await open(page, `/marcas/${EMPTY_BRAND_SLUG}`);
    await expect(page.getByRole("heading", { name: "Pronto tendremos productos de esta marca" })).toBeVisible();
    await expect(page.getByRole("link", { name: /catálogo|tienda/i }).filter({ visible: true }).first()).toHaveAttribute("href", /\/tienda/);
    expect(await robots(page)).toMatch(/noindex/);
  });
});

test.describe("líneas de una marca", () => {
  test.skip(
    !PARENT_BRAND_SLUG || !PARENT_BRAND_NAME || !LINE_BRAND_SLUG || !LINE_BRAND_NAME,
    "sin E2E_PARENT_BRAND_SLUG / E2E_PARENT_BRAND_NAME / E2E_LINE_BRAND_SLUG / E2E_LINE_BRAND_NAME",
  );

  test("/tienda?marca=<madre> incluye los productos de la línea", async ({ page }) => {
    const productHrefs = async () => new Set(await grid(page).evaluateAll((links) => links.map((link) => link.getAttribute("href"))));
    await open(page, `/marcas/${LINE_BRAND_SLUG}`);
    await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
    const lineHrefs = await productHrefs();

    await openListing(page, `/tienda?marca=${PARENT_BRAND_SLUG}`);
    const parentHrefs = await productHrefs();
    expect(Array.from(lineHrefs).some((href) => parentHrefs.has(href))).toBe(true);
  });

  test("la página de la línea dice «Una línea de <Madre>» con enlace a la madre", async ({ page }) => {
    await open(page, `/marcas/${LINE_BRAND_SLUG}`);
    const header = page.locator("section[aria-labelledby='brand-title']");
    await expect(header.getByRole("heading", { level: 1, name: LINE_BRAND_NAME })).toBeVisible({ timeout: 45_000 });
    await expect(header.getByText(`Una línea de ${PARENT_BRAND_NAME}`)).toBeVisible();
    await expect(header.getByRole("link", { name: PARENT_BRAND_NAME, exact: true })).toHaveAttribute("href", `/marcas/${PARENT_BRAND_SLUG}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("la página de la madre trae un chip de la línea", async ({ page }) => {
    await open(page, `/marcas/${PARENT_BRAND_SLUG}`);
    const lines = page.getByRole("navigation", { name: "Líneas" });
    await expect(lines).toBeVisible({ timeout: 45_000 });
    const chip = lines.locator(`a[href="/marcas/${LINE_BRAND_SLUG}"]`);
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAccessibleName(new RegExp(`^${LINE_BRAND_NAME}: `));
    expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("ficha del producto", () => {
  test("«Original <Marca> ›», fila de Detalles en texto y carril «Más de <Marca>»", async ({ page }) => {
    await open(page, `/producto/${BRAND_PRODUCT_SLUG}`);
    const pill = page.getByRole("link", { name: new RegExp(`Original ${BRAND_NAME}`) }).first();
    await expect(pill).toHaveAttribute("href", `/marcas/${BRAND_SLUG}`);

    await page.getByRole("button", { name: /Detalles y medidas/ }).first().click();
    const detailLink = page.getByRole("link", { name: BRAND_NAME, exact: true }).filter({ visible: true }).first();
    await expect(detailLink).toHaveAttribute("href", `/marcas/${BRAND_SLUG}`);
    await expect(detailLink.locator("img")).toHaveCount(0);

    const rail = page.getByRole("heading", { name: `Más de ${BRAND_NAME}` });
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toBeVisible();
  });
});

test.describe("menú", () => {
  test("el cajón trae «Marcas» con «Ver todas»", async ({ page }) => {
    await open(page, "/");
    await page.getByRole("button", { name: "Abrir menú de categorías" }).click();
    const drawer = page.getByRole("navigation", { name: "Categorías" });
    await expect(drawer.getByText("Marcas", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Ver todas" }).first()).toHaveAttribute("href", "/marcas");
  });
});

test.describe("medición", () => {
  for (const path of [`/marcas/${BRAND_SLUG}`, `/tienda?marca=${BRAND_SLUG}`]) {
    test(`web_vitals_lcp y web_vitals_inp salen en ${path}`, async ({ page }) => {
      await skipPrivacyBanner(page, true);
      // gtag de mentira: guarda los eventos en vez de mandarlos a GA4.
      await page.addInitScript(() => {
        const events: string[] = [];
        Object.defineProperty(window, "__vitals", { value: events });
        window.gtag = ((command: string, name: string) => {
          if (command === "event") events.push(name);
        }) as typeof window.gtag;
      });
      await open(page, path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 45_000 });
      await page.waitForTimeout(1_500);
      // El LCP se cierra con la primera interacción; el INP necesita una y se manda al ocultar la página.
      await page.getByRole("heading", { level: 1 }).click();
      await page.keyboard.press("Tab");
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __vitals: string[] }).__vitals.filter((name) => name.startsWith("web_vitals_"))), { timeout: 15_000 })
        .toEqual(expect.arrayContaining(["web_vitals_lcp", "web_vitals_inp"]));
    });
  }
});

test.describe("marca oculta", () => {
  test.skip(!HIDDEN_BRAND_SLUG || !HIDDEN_BRAND_NAME, "sin E2E_HIDDEN_BRAND_SLUG / E2E_HIDDEN_BRAND_NAME");

  test("no tiene página ni aparece en el índice, la fila ni la ficha", async ({ page }) => {
    const response = await page.goto(`/marcas/${HIDDEN_BRAND_SLUG}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);

    await open(page, "/marcas");
    await expect(page.getByRole("link", { name: new RegExp(HIDDEN_BRAND_NAME!) })).toHaveCount(0);

    await openListing(page, "/tienda");
    await expect(brandChip(page, HIDDEN_BRAND_NAME!)).toHaveCount(0);

    if (HIDDEN_BRAND_PRODUCT_SLUG) {
      await open(page, `/producto/${HIDDEN_BRAND_PRODUCT_SLUG}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(`Original ${HIDDEN_BRAND_NAME}`) })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: `Más de ${HIDDEN_BRAND_NAME}` })).toHaveCount(0);
    }
  });
});
