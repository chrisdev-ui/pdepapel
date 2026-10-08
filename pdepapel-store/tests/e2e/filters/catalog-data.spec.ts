import { skipPrivacyBanner } from "../helpers/public-page";
import { expect, test, type Locator, type Page } from "../helpers/safe-test";

/**
 * Bloque 3 de la auditoría de filtros (docs/audits/2026-10-08-filtros-tienda.md):
 * datos del catálogo (M3–M6) y detalles de la tienda (B1, B3–B7). Solo lectura.
 */

const ADMIN_API =
  process.env.E2E_ADMIN_API_URL || "https://admin.papeleriapdepapel.com/api/f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

type PublicCategory = { id: string; name: string; slug?: string; typeId: string; productCount?: number };
type PublicType = { id: string; name: string; slug?: string };

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const grid = (page: Page) => page.locator('#catalog-results a[href^="/producto/"]');
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Filtros" });
const label = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, "").trim();

async function adminJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${ADMIN_API}${path}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

/** Antes de hidratar el clic no hace nada: se repite solo si la URL no cambió. */
async function clickUntilParam(page: Page, target: Locator, keys: string[]) {
  await expect(async () => {
    if (keys.every((key) => param(page, key) === null)) await target.click();
    expect(keys.map((key) => param(page, key)).some((value) => value !== null)).toBe(true);
  }).toPass({ timeout: 45_000, intervals: [2_000] });
}

/** «Mostrando 1–24 de 108 productos» → 108. */
async function shownTotal(page: Page) {
  const text = await page.getByText(/de [\d.]+ productos?$/).filter({ visible: true }).first().textContent();
  return Number((text ?? "").match(/de ([\d.]+) productos?$/)?.[1]?.replace(/\./g, ""));
}

async function openListing(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#catalog-results")).toBeVisible({ timeout: 45_000 });
}

test.beforeEach(async ({ page }) => {
  await skipPrivacyBanner(page);
});

test("M5: un tipo que no existe muestra el vacío, no todo el catálogo", async ({ page }) => {
  await openListing(page, "/tienda?typeId=no-existe-e2e");
  await expect(page.getByRole("heading", { name: "Nada con estos filtros" })).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
});

test("M4: el número junto a un color es lo que se ve al elegirlo", async ({ page }) => {
  test.skip(!isDesktop(page), "Los conteos se leen en la barra lateral de escritorio.");
  await openListing(page, "/tienda");
  const header = sidebar(page).getByRole("button", { name: /^Colores/ });
  test.skip((await header.count()) === 0, "Sin grupo de colores.");
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  const colors = page.locator(`[id="${await header.getAttribute("aria-controls")}"]`).getByRole("checkbox");
  await expect(colors.first()).toBeVisible();
  const row = colors.first().locator("xpath=..");
  const expected = Number(((await row.textContent()) ?? "").match(/(\d[\d.]*)\s*$/)?.[1]?.replace(/\./g, ""));
  await clickUntilParam(page, colors.first(), ["colorId"]);
  await expect.poll(() => shownTotal(page)).toBe(expected);
});

test("M6: el megamenú no ofrece subcategorías vacías", async ({ page }) => {
  test.skip(!isDesktop(page), "El megamenú es de escritorio.");
  const categories = await adminJson<PublicCategory[]>(page, "/categories");
  test.skip(!categories.some((category) => "productCount" in category), "La API todavía no publica productCount.");
  const empty = new Set(categories.filter((category) => category.productCount === 0).map((category) => `/categoria/${category.slug ?? category.id}`));

  await openListing(page, "/tienda");
  await page.getByRole("button", { name: "Todas las categorías" }).click();
  const menu = page.getByRole("region", { name: "Categorías de la tienda" });
  const typeLinks = menu.locator('a[href^="/tienda?typeId="]');
  const offered = new Set<string>();
  for (let index = 0; index < (await typeLinks.count()); index += 1) {
    await typeLinks.nth(index).hover();
    for (const href of await menu.locator('a[href^="/categoria/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
      offered.add(href);
    }
  }
  expect(offered.size).toBeGreaterThan(0);
  expect(Array.from(offered).filter((href) => empty.has(href))).toEqual([]);
});

test("B7: una subcategoría vacía lo dice sin culpar a los filtros", async ({ page }) => {
  const categories = await adminJson<PublicCategory[]>(page, "/categories");
  const empty = categories.find((category) => category.productCount === 0 && category.slug);
  test.skip(!empty, "No hay subcategorías vacías ahora mismo.");
  await openListing(page, `/categoria/${empty!.slug}`);
  await expect(page.getByRole("heading", { name: "Aún no hay productos en esta categoría" })).toBeVisible();
});

test("B3: una página que no existe lleva a la última", async ({ page }) => {
  await page.goto("/tienda?page=999", { waitUntil: "domcontentloaded" });
  await expect.poll(() => Number(param(page, "page") ?? 1), { timeout: 90_000 }).toBeLessThan(999);
  await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Mostrando (\d[\d.]*)–(\d[\d.]*)/).filter({ visible: true }).first()).not.toHaveText(/–24 de 24|Mostrando 2\d{3}–5/);
});

test("B5: un tipo por slug se ve como filtro aplicado", async ({ page }) => {
  const types = await adminJson<PublicType[]>(page, "/types");
  const type = types.find((item) => item.slug);
  test.skip(!type, "Ningún tipo tiene slug.");
  await openListing(page, `/tienda?typeId=${type!.slug}`);
  await expect(page.getByRole("button", { name: `Quitar filtro ${label(type!.name)}` }).filter({ visible: true }).first()).toBeVisible();
});

test("B4: el tipo elegido se ve aunque quede después de los diez primeros", async ({ page }) => {
  test.skip(!isDesktop(page), "La lista de tipos se mira en la barra lateral de escritorio.");
  const types = await adminJson<PublicType[]>(page, "/types");
  const sorted = [...types].sort((a, b) => label(a.name).localeCompare(label(b.name), "es"));
  test.skip(sorted.length <= 10, "Menos de once tipos.");
  const last = sorted[sorted.length - 1];
  await openListing(page, `/tienda?typeId=${last.id}`);
  await expect(sidebar(page).getByRole("checkbox", { name: label(last.name) })).toBeChecked();
});

test("B1: filtrar en el navegador actualiza las migas y deja el conteo junto a los chips", async ({ page }) => {
  test.skip(!isDesktop(page), "Barra lateral de escritorio.");
  await openListing(page, "/tienda");
  const box = sidebar(page).getByRole("checkbox").first();
  const name = (await box.getAttribute("aria-label")) ?? (await page.locator(`label[for="${await box.getAttribute("id")}"]`).textContent());
  await clickUntilParam(page, box, ["typeId", "categoryId"]);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText((name ?? "").trim());
  await expect(page.getByText(/de [\d.]+ productos?$/).filter({ visible: true }).first()).toBeVisible();
});

test("B6: las sugerencias de la cabecera codifican lo que se escribe", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const search = page.getByRole("combobox", { name: "Buscar productos" }).filter({ visible: true }).first();
  let encoded = false;
  page.on("request", (request) => {
    if (request.url().includes("/search/products?search=a%26b")) encoded = true;
  });
  await expect(async () => {
    await search.fill("");
    await search.fill("a&b");
    await expect.poll(() => encoded, { timeout: 5_000 }).toBe(true);
  }).toPass({ timeout: 60_000, intervals: [1_000] });
});
