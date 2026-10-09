import { skipPrivacyBanner } from "../helpers/public-page";
import { expect, test, type Page } from "../helpers/safe-test";

/**
 * Auditoría de filtros 2026-10-08 (docs/audits/2026-10-08-filtros-tienda.md):
 * A1 «Atrás» desde la ficha, A2 megamenú tras un filtro, A3 paginar con
 * filtro, A4/M2 quitar precio o búsqueda, M1 hoja móvil, M7 scroll al volver.
 */

const SETTLE_MS = 4_000;

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const grid = (page: Page) => page.locator('#catalog-results a[href^="/producto/"]');
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);
const chips = (page: Page) => page.getByRole("list", { name: "Filtros aplicados" }).filter({ visible: true }).first();
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Filtros" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Filtros de productos" });

async function openListing(page: Page, path = "/tienda") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(grid(page).first()).toBeVisible({ timeout: 45_000 });
  // La interfaz responde a clics recién cuando hidrata.
  await expect(page.getByRole("button", { name: "Filtros" }).first()).toBeEnabled({ timeout: 45_000 }).catch(() => undefined);
}

async function openSheet(page: Page) {
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await expect(sheet(page)).toBeVisible();
}

async function applySheet(page: Page) {
  await sheet(page).getByRole("button", { name: /^Ver [\d.]+ productos?$/ }).click();
  await expect(sheet(page)).toBeHidden();
}

/** Cambia un filtro en el navegador (no por URL), que es lo que dispara A1–A3. */
async function turnSaleOn(page: Page) {
  if (isDesktop(page)) {
    await sidebar(page).getByRole("switch", { name: "Mostrar solo ofertas" }).click();
  } else {
    await openSheet(page);
    await sheet(page).getByRole("switch", { name: "Mostrar solo ofertas" }).click();
    await applySheet(page);
  }
  await expect.poll(() => param(page, "isOnSale")).toBe("true");
}

async function removeChip(page: Page, name: RegExp) {
  await chips(page).getByRole("button", { name }).first().click();
}

/** El tipo con más productos, para que haya más de una página. */
async function selectBiggestType(page: Page) {
  const scope = isDesktop(page) ? sidebar(page) : (await openSheet(page), sheet(page));
  const boxes = scope.getByRole("checkbox");
  const counts = await boxes.evaluateAll((elements) =>
    elements.map((element) => Number((element.parentElement?.textContent ?? "").match(/(\d[\d.]*)\s*$/)?.[1]?.replace(/\./g, "") ?? 0)),
  );
  const index = counts.indexOf(Math.max(...counts));
  await boxes.nth(index).click();
  if (!isDesktop(page)) await applySheet(page);
  await expect.poll(() => param(page, "typeId") ?? param(page, "categoryId")).not.toBeNull();
}

test.beforeEach(async ({ page }) => {
  await skipPrivacyBanner(page);
});

test("A1: filtro → ficha → «Atrás» vuelve al listado, y otro «Atrás» sale de la tienda sin deshacer filtros", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openListing(page);
  const listingTitle = (await page.locator("h1").first().textContent())?.trim();
  await turnSaleOn(page);
  await removeChip(page, /Solo ofertas/);
  await expect.poll(() => param(page, "isOnSale")).toBeNull();
  await expect(grid(page).first()).toBeVisible();

  await grid(page).first().click();
  await page.waitForURL(/\/producto\//);
  await expect(page.locator("h1").first()).not.toHaveText(listingTitle ?? "");

  await page.goBack();
  await page.waitForURL(/\/tienda/);
  await expect(page.locator("h1").first()).toHaveText(listingTitle ?? "", { timeout: 10_000 });
  await expect(grid(page).first()).toBeVisible({ timeout: 10_000 });

  // Los dos clics de «Solo ofertas» reemplazaron la entrada: «Atrás» va a la página anterior.
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
});

test("A2: el megamenú cambia los productos después de un filtro", async ({ page }) => {
  test.skip(!isDesktop(page), "El megamenú es de escritorio; en teléfono se usa el cajón de categorías.");
  await openListing(page);
  await turnSaleOn(page);

  await page.getByRole("button", { name: "Todas las categorías" }).click();
  const typeLink = page.getByRole("region", { name: "Categorías de la tienda" }).locator('a[href^="/tienda?typeId="]').first();
  const typeId = new URL((await typeLink.getAttribute("href"))!, page.url()).searchParams.get("typeId")!;
  const catalogRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.searchParams.getAll("typeId").includes(typeId) && url.searchParams.get("isOnSale") !== "true";
  }, { timeout: 20_000 });
  await typeLink.click();

  await catalogRequest;
  await expect.poll(() => param(page, "typeId")).toBe(typeId);
  expect(param(page, "isOnSale")).toBeNull();
  await expect(sidebar(page).getByRole("switch", { name: "Mostrar solo ofertas" })).not.toBeChecked();
  await expect(chips(page).getByRole("button", { name: /Solo ofertas/ })).toHaveCount(0);
});

test("A3: paginar y ordenar conservan el filtro", async ({ page }) => {
  await openListing(page);
  await selectBiggestType(page);
  const typeId = param(page, "typeId");

  const next = page.getByRole("link", { name: "Ir a la página siguiente" });
  await expect(next).toHaveAttribute("href", /typeId=/);
  await next.click();
  await expect.poll(() => param(page, "page")).toBe("2");
  expect(param(page, "typeId")).toBe(typeId);
  await page.waitForTimeout(SETTLE_MS);
  expect(param(page, "typeId")).toBe(typeId);
  await expect(chips(page).getByRole("button")).not.toHaveCount(0);
  for (const href of await page.getByRole("navigation", { name: "Paginación" }).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
    expect(href).toContain("typeId=");
  }

  if (isDesktop(page)) {
    await expect(sidebar(page).getByRole("checkbox", { checked: true })).not.toHaveCount(0);
    await page.getByRole("combobox", { name: "Ordenar productos" }).click();
    const option = page.getByRole("option", { name: "Menor precio" });
    await expect(option).toBeVisible();
    // El menú de Radix entra con animación; antes de asentarse el clic cae fuera.
    await page.waitForTimeout(400);
    await option.click();
    await expect.poll(() => param(page, "sortOption")).not.toBeNull();
    expect(param(page, "typeId")).toBe(typeId);
  }

  // Ordenar reemplaza; paginar y elegir el tipo apilan: «Atrás» deshace la página y luego el tipo.
  await page.goBack();
  await expect.poll(() => param(page, "page")).toBeNull();
  expect(param(page, "typeId")).toBe(typeId);
  expect(param(page, "sortOption")).toBeNull();
  await page.goBack();
  await expect.poll(() => param(page, "typeId") ?? param(page, "categoryId")).toBeNull();
  expect(new URL(page.url()).pathname).toBe("/tienda");
});

test("A4: quitar el precio con el chip no lo vuelve a poner", async ({ page }) => {
  await openListing(page);
  if (isDesktop(page)) {
    await sidebar(page).getByRole("button", { name: "$ 5.000 – $ 10.000" }).click();
  } else {
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "$ 5.000 – $ 10.000" }).click();
    // El rango llega a la hoja después del debounce del filtro de precio.
    await page.waitForTimeout(800);
    await applySheet(page);
  }
  await expect.poll(() => param(page, "minPrice")).toBe("5000");

  await removeChip(page, /\$/);
  await page.waitForTimeout(SETTLE_MS);
  expect(param(page, "minPrice")).toBeNull();
  expect(param(page, "maxPrice")).toBeNull();
});

test("A4: «Limpiar todo» quita el precio y no vuelve", async ({ page }) => {
  await openListing(page, "/tienda?minPrice=5000&maxPrice=10000");
  await page.getByRole("button", { name: "Limpiar todo" }).filter({ visible: true }).first().click();
  await page.waitForTimeout(SETTLE_MS);
  expect(param(page, "minPrice")).toBeNull();
});

test("A4: el megamenú no arrastra el precio anterior", async ({ page }) => {
  test.skip(!isDesktop(page), "El megamenú es de escritorio.");
  await openListing(page, "/tienda?minPrice=5000&maxPrice=10000");
  await page.getByRole("button", { name: "Todas las categorías" }).click();
  await page.getByRole("region", { name: "Categorías de la tienda" }).locator('a[href^="/tienda?typeId="]').first().click();
  await expect.poll(() => param(page, "typeId")).not.toBeNull();
  await page.waitForTimeout(SETTLE_MS);
  expect(param(page, "minPrice")).toBeNull();
});

test("M2: quitar la búsqueda de la categoría con el chip no la vuelve a poner", async ({ page }) => {
  await openListing(page, "/categoria/stickers");
  const search = page.getByPlaceholder(/^Buscar en/).filter({ visible: true }).first();
  await search.fill("gato");
  await expect.poll(() => param(page, "search")).toBe("gato");
  await search.blur();

  await removeChip(page, /Búsqueda/);
  await page.waitForTimeout(SETTLE_MS);
  expect(param(page, "search")).toBeNull();
  await expect(search).toHaveValue("");
});

test("M1: la hoja de filtros se abre con lo que dice la URL", async ({ page }) => {
  test.skip(isDesktop(page), "La hoja de filtros es de teléfono y tableta.");
  await openListing(page);
  await openSheet(page);
  await sheet(page).getByRole("checkbox").first().click();
  await applySheet(page);
  await expect(chips(page).getByRole("button")).not.toHaveCount(0);

  await chips(page).getByRole("button").first().click();
  await expect(chips(page).getByRole("button")).toHaveCount(0);

  await openSheet(page);
  await expect(sheet(page).getByRole("checkbox", { checked: true })).toHaveCount(0);
});

test("M7: al volver de la ficha el listado queda a la misma altura", async ({ page }) => {
  await openListing(page);
  const card = grid(page).nth(9);
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(400);

  // Sin el desplazamiento que Playwright hace antes de un clic: WebKit movía la página.
  await card.evaluate((link: HTMLElement) => link.click());
  await page.waitForURL(/\/producto\//);
  await page.waitForTimeout(1_000);
  await page.goBack();
  await page.waitForURL(/\/tienda/);
  await expect(grid(page).nth(9)).toBeAttached({ timeout: 10_000 });
  await page.waitForTimeout(1_500);

  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThan(150);
});
