import { expect, Page, test } from "@playwright/test";

import { gotoPublicPage, skipPrivacyBanner } from "./helpers/public-page";

const productSlug = process.env.E2E_PURCHASABLE_PRODUCT_SLUG;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBeTruthy();
}

test("filtra el catálogo y oculta la talla logística", async ({ page }) => {
  await skipPrivacyBanner(page);
  await gotoPublicPage(page, "/tienda");
  await expect(
    page.getByRole("button", { name: "Abrir carrito, 0 productos" }).first(),
  ).toBeEnabled({ timeout: 15_000 });

  await expect(page.getByText("Tallas", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tamaño", { exact: true })).toHaveCount(0);

  const isCompact = (page.viewportSize()?.width ?? 0) < 1024;
  if (isCompact) {
    await page.getByRole("button", { name: "Filtros" }).click();
    await expect(
      page.getByRole("dialog", { name: "Filtros de productos" }),
    ).toBeVisible();
  }

  const visibleFilters = isCompact
    ? page.getByRole("dialog", { name: "Filtros de productos" })
    : page;
  const firstFilter = visibleFilters.getByRole("checkbox").first();
  await expect(firstFilter).toBeVisible();
  await firstFilter.click();
  await expect(page).toHaveURL(
    /(?:typeId|categoryId|optionValueId|colorId|designId)=/,
  );
  await expect(
    page.getByRole("region", { name: "Resultados del catálogo" }),
  ).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });

  if (isCompact) await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);
});

test("muestra opciones públicas en el producto de prueba", async ({ page }) => {
  test.skip(
    !productSlug,
    "Requiere E2E_PURCHASABLE_PRODUCT_SLUG y los datos locales de prueba.",
  );

  await skipPrivacyBanner(page);
  await gotoPublicPage(page, `/producto/${productSlug}`);
  await expect(
    page.getByRole("heading", { name: "Producto feria E2E" }),
  ).toBeVisible();
  await expect(page.getByText("Formato:", { exact: true })).toBeVisible();
  await expect(page.getByText("A5", { exact: true })).toBeVisible();
  await expect(page.getByText("Tamaño:", { exact: true })).toHaveCount(0);
  await expect(page.getByText("M-P", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("mantiene utilizables los controles del catálogo en tableta", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Una sola pasada de tableta es suficiente.",
  );
  await page.setViewportSize({ width: 768, height: 1024 });
  await skipPrivacyBanner(page);
  await gotoPublicPage(page, "/tienda");
  await expect(
    page.getByRole("button", { name: "Abrir carrito, 0 productos" }).first(),
  ).toBeEnabled({ timeout: 15_000 });

  await expect(
    page.getByRole("combobox", { name: "Ordenar productos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Mostrar solo ofertas" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Filtros" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Filtros" }).click();
  const filtersDialog = page.getByRole("dialog", {
    name: "Filtros de productos",
  });
  await expect(filtersDialog).toBeVisible();
  await expect(
    filtersDialog.getByText("Categorías", { exact: true }),
  ).toBeVisible();
  await expect(
    filtersDialog.getByRole("button", { name: "Cerrar" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
