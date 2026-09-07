import { expect, test } from "@playwright/test";

import { gotoPublicPage, skipPrivacyBanner } from "./helpers/public-page";

test("la barra superior muestra el país y el menú móvil lleva a una categoría", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "El cajón de categorías solo existe en pantallas pequeñas.",
  );
  await skipPrivacyBanner(page);
  await gotoPublicPage(page, "/");

  await expect(page.getByRole("region", { name: "Información de la tienda" })).toContainText(
    "Colombia",
  );
  await expect(page.getByRole("combobox", { name: "Buscar productos" })).toBeVisible();

  const drawer = page.getByRole("dialog");
  // Retry the tap until React has hydrated the header (slow dev servers).
  await expect(async () => {
    await page.getByRole("button", { name: "Abrir menú de categorías" }).click();
    await expect(drawer).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });

  const firstType = drawer.getByRole("button").filter({ hasText: /\S/ }).first();
  await firstType.click();
  const subcategory = drawer.locator('a[href^="/categoria/"]').first();
  await expect(subcategory).toBeVisible();
  const href = await subcategory.getAttribute("href");
  await subcategory.click();

  // Route compilation on a dev server can take a while on first visit.
  await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 30_000 });
  await expect(page.locator("h1")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBeTruthy();
});

test("el mega menú de escritorio abre y enlaza subcategorías", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Solo escritorio.");
  await skipPrivacyBanner(page);
  await gotoPublicPage(page, "/");

  const trigger = page.getByRole("button", { name: "Todas las categorías" });
  const panel = page.getByRole("region", { name: "Categorías de la tienda" });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    await trigger.click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(panel.locator('a[href^="/categoria/"]').first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("buscar desde la cabecera abre los resultados en la tienda", async ({ page }) => {
  await skipPrivacyBanner(page);
  await gotoPublicPage(page, "/");

  const search = page.getByRole("combobox", { name: "Buscar productos" });
  await expect(search).toBeVisible();
  // Once hydrated, Enter is handled client-side and routes to /tienda.
  await expect(async () => {
    await search.fill("cuaderno");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/tienda\?search=cuaderno/, { timeout: 3000 });
  }).toPass({ timeout: 25_000 });

  await expect(
    page.getByRole("region", { name: "Resultados del catálogo" }),
  ).toBeVisible({ timeout: 30_000 });
});
