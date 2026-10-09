import { skipPrivacyBanner } from "./helpers/public-page";
import { expect, test, type Page } from "./helpers/safe-test";

/**
 * Cada nivel de las migas lleva a su página, en la ficha, en la subcategoría
 * y en la tienda filtrada (en esta última la subcategoría era texto y no
 * navegaba). Los datos se descubren en vivo para no depender de un producto.
 */

const crumbLinks = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link");

async function crumbHrefs(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(crumbLinks(page).first()).toBeVisible({ timeout: 45_000 });
  return crumbLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
}

async function expectEveryCrumbNavigates(page: Page, path: string) {
  const hrefs = await crumbHrefs(page, path);
  expect(hrefs.length, `migas en ${path}`).toBeGreaterThan(1);
  for (let index = 0; index < hrefs.length; index += 1) {
    const href = hrefs[index];
    expect(href, `miga ${index} en ${path}`).toMatch(/^\/[^\s]*$/);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await crumbLinks(page).nth(index).click();
    const target = new URL(href, page.url());
    await expect
      .poll(() => {
        const current = new URL(page.url());
        return current.pathname === target.pathname && current.search === target.search;
      }, { message: `«${href}» desde ${path}`, timeout: 30_000 })
      .toBe(true);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  }
  return hrefs;
}

test("las migas de la ficha, la subcategoría y la tienda filtrada navegan en cada nivel", async ({ page }) => {
  test.setTimeout(240_000);
  await skipPrivacyBanner(page);

  await page.goto("/tienda", { waitUntil: "domcontentloaded" });
  const firstProduct = page.locator('#catalog-results a[href^="/producto/"]').first();
  await expect(firstProduct).toBeVisible({ timeout: 45_000 });
  const productPath = (await firstProduct.getAttribute("href")) as string;

  const productCrumbs = await expectEveryCrumbNavigates(page, productPath);
  const categoryPath = productCrumbs.find((href) => href.startsWith("/categoria/"));
  expect(categoryPath, "la ficha enlaza su subcategoría").toBeTruthy();

  const categoryCrumbs = await expectEveryCrumbNavigates(page, categoryPath as string);
  const typeHref = categoryCrumbs.find((href) => href.includes("typeId="));
  expect(typeHref, "la subcategoría enlaza su tipo").toBeTruthy();

  const slug = (categoryPath as string).split("/").pop() as string;
  const filtered = `${typeHref}&categoryId=${encodeURIComponent(slug)}`;
  const filteredCrumbs = await expectEveryCrumbNavigates(page, filtered);
  expect(filteredCrumbs).toContain(categoryPath);
});
