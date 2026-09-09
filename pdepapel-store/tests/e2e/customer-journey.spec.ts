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

    const addToCartButton = page
      .getByRole("button", { name: /Agregar al carrito/ })
      .first();
    await expect(
      page.getByRole("button", { name: "Abrir carrito, 0 productos" }).first(),
    ).toBeEnabled();
    await expect(addToCartButton).toBeEnabled();
    // El botón agrega al carrito solo cuando la página ya hidrató.
    await page.waitForLoadState("networkidle");
    await addToCartButton.click();

    // Desde la ficha se abre el panel del carrito con el producto resaltado.
    const cartDrawer = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(cartDrawer).toBeVisible();
    await expect(
      cartDrawer.getByText("Agregado al carrito", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBeTruthy();

    const viewCartButton = cartDrawer.getByRole("button", { name: "Ver carrito" });
    const checkoutButton = cartDrawer.getByRole("button", { name: "Finalizar compra" });
    await expect(viewCartButton).toBeVisible();
    await expect(checkoutButton).toBeVisible();

    await viewCartButton.click();
    await expect(page).toHaveURL(/\/carrito/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Mi carrito/ }),
    ).toBeVisible();
    await expect(page.getByText("Resumen del pedido")).toBeVisible();

    const finishButton = page
      .getByRole("button", { name: "Finalizar compra" })
      .first();
    await expect(finishButton).toBeEnabled();
    await finishButton.click();
    await expect(page).toHaveURL(/\/finalizar-compra/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeVisible();
  });
});
