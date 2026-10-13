import { expect, Page } from "../../helpers/safe-test";

import { skipPrivacyBanner } from "../../helpers/public-page";

/**
 * El carrito y los pasos del checkout contra la administración local, para las
 * pruebas que crean pedidos de verdad en `pdepapel_test`.
 */

export const PRODUCT_ID = "e2e-fair-product";
export const UNIT_PRICE = 10000;
export const QUANTITY = 2;

export const CART_STORAGE = {
  state: {
    items: [
      {
        id: PRODUCT_ID,
        slug: "producto-feria-e2e",
        name: "Producto feria E2E",
        description: "Producto exclusivo para las pruebas E2E.",
        price: String(UNIT_PRICE),
        stock: 20,
        isFeatured: false,
        isArchived: false,
        category: {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Categoría E2E",
          typeId: "00000000-0000-4000-8000-000000000001",
        },
        size: { id: "e2e-fair-size", name: "M", value: "M-P" },
        color: { id: "e2e-fair-color", name: "E2E", value: "#ffffff" },
        design: { id: "e2e-fair-design", name: "E2E" },
        images: [],
        reviews: [],
        sku: "E2E-FAIR-PRODUCT",
        quantity: QUANTITY,
      },
    ],
  },
  version: 1,
};

export const formButton = (page: Page, name: string | RegExp) =>
  page.locator("#checkout-form form").getByRole("button", { name });

export async function startCheckout(page: Page, { analytics = false }: { analytics?: boolean } = {}) {
  await skipPrivacyBanner(page, analytics);
  await page.route("**/boldPaymentButton.js", (route) => route.abort());
  // El buscador de ciudades sale del DANE a través de Redis y un servicio
  // externo, no de la base local: en frío devuelve vacío en silencio. Es un
  // tercero, como el script de Bold, y no es lo que se está probando.
  await page.route("**/api/locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            value: "05001000",
            label: "MEDELLÍN - ANTIOQUIA",
            city: "MEDELLÍN",
            department: "ANTIOQUIA",
            daneCode: "05001000",
            raw: {
              locationCode: "05001000",
              cityName: "MEDELLÍN",
              departmentName: "ANTIOQUIA",
            },
          },
        ],
        count: 1,
      }),
    }),
  );
  await page.addInitScript((cart) => {
    window.localStorage.setItem("cart-storage", JSON.stringify(cart));
    window.localStorage.removeItem("checkout-storage");
  }, CART_STORAGE);
  await page.goto("/finalizar-compra");
}

export async function fillContact(page: Page) {
  const next = formButton(page, "Continuar a entrega");
  await expect(next).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Paula Andrea Restrepo");
  await page.getByLabel(/Correo electrónico/).fill("paula@ejemplo.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3025556677");
  await page.getByLabel(/Documento de identidad/).fill("1047452823");
  await next.click();
  await expect(
    page.getByRole("heading", { name: "¿A dónde lo enviamos?" }),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Se elige «Acordar por WhatsApp» antes de la dirección a propósito: con esa
 * opción ni la tienda pide cotización ni la administración vuelve a cotizar
 * contra la transportadora, así que la prueba no depende de EnvioClick.
 */
export async function fillDeliveryWithoutCarrier(page: Page) {
  // El radio es `sr-only`; lo que se toca es su etiqueta.
  await page.locator('label[for="opt-custom_whatsapp"]').click();
  await expect(page.locator("#opt-custom_whatsapp")).toHaveAttribute(
    "data-state",
    "checked",
  );

  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click();
  await city.fill("Medell");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await expect(city).toHaveValue(/MEDELL/i);
  await page.getByLabel(/^Dirección \*/).fill("Calle 123 # 45-67");

  await formButton(page, "Continuar al pago").click();
  await expect(
    page.getByRole("heading", { name: "Pago y confirmación" }),
  ).toBeVisible({ timeout: 30_000 });
}
