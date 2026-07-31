import { expect, test } from "@playwright/test";

const purchasableProductSlug = process.env.E2E_PURCHASABLE_PRODUCT_SLUG;

test.describe("recorrido de compra sin pago", () => {
  test.skip(
    !purchasableProductSlug,
    "Define E2E_PURCHASABLE_PRODUCT_SLUG con un producto de pruebas disponible.",
  );

  test("agrega un producto al carrito y llega al inicio del checkout sin crear una orden", async ({
    page,
  }) => {
    await page.goto(`/producto/${purchasableProductSlug}`, {
      waitUntil: "domcontentloaded",
    });

    const addToCartButton = page.getByRole("button", {
      name: "Agregar al carrito",
    });
    await expect(addToCartButton).toBeEnabled();
    await addToCartButton.click();

    await page.goto("/carrito", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Mi Carrito" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Completar pedido" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "Completar pedido" }).click();
    await expect(page).toHaveURL(/\/finalizar-compra/);
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeVisible();
  });
});
