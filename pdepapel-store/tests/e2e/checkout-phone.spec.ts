import { expect, test } from "@playwright/test";

import { gotoPublicPage } from "./helpers/public-page";

test("normaliza un teléfono colombiano guardado antes de mostrar el checkout", async ({
  page,
}) => {
  const phoneWarnings: string[] = [];

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Expected the initial value to be a E.164 phone number")
    ) {
      phoneWarnings.push(message.text());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "cart-storage",
      JSON.stringify({
        state: {
          items: [
            {
              id: "checkout-phone-e2e-product",
              slug: "checkout-phone-e2e-product",
              category: { id: "category-id", name: "Pruebas", typeId: "" },
              name: "Producto de prueba local",
              description: "No se envía ni crea una orden.",
              price: "10000",
              stock: 5,
              isFeatured: false,
              isArchived: false,
              size: { id: "size-id", name: "", value: "" },
              color: { id: "color-id", name: "", value: "" },
              design: { id: "design-id", name: "" },
              images: [],
              reviews: [],
              sku: "E2E-PHONE",
              quantity: 1,
            },
          ],
        },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      "checkout-storage",
      JSON.stringify({
        state: {
          formData: {
            telephone: "3001234567",
          },
        },
        version: 0,
      }),
    );
  });

  await gotoPublicPage(page, "/finalizar-compra");

  const phoneInput = page.getByRole("textbox", { name: /Teléfono/ });
  await expect(phoneInput).toHaveValue(/300.*123.*4567/);
  expect(phoneWarnings).toEqual([]);
});
