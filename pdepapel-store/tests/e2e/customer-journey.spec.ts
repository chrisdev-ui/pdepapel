import { expect, test } from "@playwright/test";

import { gotoPublicPage } from "./helpers/public-page";

const purchasableProductSlug = process.env.E2E_PURCHASABLE_PRODUCT_SLUG;

test.describe("recorrido de compra sin pago", () => {
  test.skip(
    !purchasableProductSlug,
    "Define E2E_PURCHASABLE_PRODUCT_SLUG con un producto de pruebas disponible.",
  );

  test("agrega un producto al carrito y llega al inicio del checkout sin crear una orden", async ({
    page,
  }) => {
    await gotoPublicPage(page, `/producto/${purchasableProductSlug}`);

    const addToCartButton = page.getByRole("button", {
      name: "Agregar al carrito",
    });
    await expect(
      page.getByRole("button", { name: "Abrir carrito, 0 productos" }).first(),
    ).toBeEnabled();
    await expect(addToCartButton).toBeEnabled();
    await addToCartButton.click();

    const cartPreview = page.getByRole("complementary", {
      name: "Producto agregado al carrito",
    });
    await expect(cartPreview).toBeVisible();
    await expect(
      cartPreview.getByText("Agregado al carrito", { exact: true }),
    ).toBeVisible();
    await expect(
      cartPreview.getByRole("link", { name: "Finalizar compra" }),
    ).toBeVisible();
    const layerOrder = await page.evaluate(() => {
      const header = document.querySelector("header");
      const preview = document.querySelector(
        '[aria-label="Producto agregado al carrito"]',
      );

      return {
        header: Number.parseInt(
          header ? window.getComputedStyle(header).zIndex : "0",
          10,
        ),
        preview: Number.parseInt(
          preview ? window.getComputedStyle(preview).zIndex : "0",
          10,
        ),
      };
    });
    expect(layerOrder.preview).toBeGreaterThan(layerOrder.header);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBeTruthy();

    await cartPreview
      .getByRole("button", { name: "Cerrar resumen del carrito" })
      .click();
    await page
      .getByRole("button", { name: "Abrir carrito, 1 producto" })
      .first()
      .click();

    const cartDrawer = page.getByRole("dialog", {
      name: "Carrito de compras",
    });
    await expect(cartDrawer).toBeVisible();
    const footer = cartDrawer.locator("footer");
    await expect(footer).toBeVisible();
    await expect
      .poll(() =>
        footer.evaluate((element) => getComputedStyle(element).flexDirection),
      )
      .toBe("column");

    const viewCartButton = cartDrawer.getByRole("button", {
      name: "Ver carrito",
    });
    const checkoutButton = cartDrawer.getByRole("button", {
      name: "Finalizar compra",
    });
    await expect(viewCartButton).toBeVisible();
    await expect(checkoutButton).toBeVisible();

    const actionTypography = await checkoutButton.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        fontWeight: Number.parseInt(styles.fontWeight, 10),
        textTransform: styles.textTransform,
      };
    });
    expect(actionTypography.fontWeight).toBeLessThanOrEqual(600);
    expect(actionTypography.textTransform).toBe("none");

    await viewCartButton.click();
    await expect(page).toHaveURL(/\/carrito/);
    await expect(
      page.getByRole("heading", { name: "Mi Carrito" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Completar pedido" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "Completar pedido" }).click();
    await expect(page).toHaveURL(/\/finalizar-compra/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeVisible();
  });
});
