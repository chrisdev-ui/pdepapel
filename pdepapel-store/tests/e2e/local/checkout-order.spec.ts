import { expect, Page, test } from "@playwright/test";

import { skipPrivacyBanner } from "../helpers/public-page";
import {
  deliverBoldWebhook,
  readOrderFromAdmin,
  readProductStock,
  SEEDED_STORE_ID,
} from "./helpers/local-environment";

/**
 * Aquí no se simula la creación del pedido: la tienda habla con una
 * administración local y escribe en `pdepapel_test`. Lo único que se bloquea es
 * el script de Bold, que vive en sus servidores y no es lo que se está
 * probando; el pago se resuelve entregando el webhook firmado.
 */

const PRODUCT_ID = "e2e-fair-product";
const UNIT_PRICE = 10000;
const QUANTITY = 2;

const CART_STORAGE = {
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

const formButton = (page: Page, name: string | RegExp) =>
  page.locator("#checkout-form form").getByRole("button", { name });

async function startCheckout(page: Page) {
  await skipPrivacyBanner(page);
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

async function fillContact(page: Page) {
  const next = formButton(page, "Continuar a entrega");
  await expect(next).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Paula Andrea Restrepo");
  await page.getByLabel(/Correo electrónico/).fill("paula@ejemplo.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3024686403");
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
async function fillDeliveryWithoutCarrier(page: Page) {
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
  await page.getByLabel(/^Dirección \*/).fill("Calle 12 AA Sur #55D-30");

  await formButton(page, "Continuar al pago").click();
  await expect(
    page.getByRole("heading", { name: "Pago y confirmación" }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Deja el pedido creado y devuelve su id, leído de la URL del pedido. */
async function placeOnlineOrder(page: Page) {
  await startCheckout(page);
  await fillContact(page);
  await fillDeliveryWithoutCarrier(page);

  await page.getByText("Pago en línea", { exact: true }).click();
  await formButton(page, /Pagar \$/).click();

  await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  expect(orderId).toBeTruthy();
  return orderId;
}

test.describe("pedido real contra la administración local", () => {
  test("el pago aprobado deja el pedido pagado y descuenta el inventario", async ({
    page,
  }) => {
    const stockBefore = await readProductStock(SEEDED_STORE_ID, PRODUCT_ID);
    const orderId = await placeOnlineOrder(page);

    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(created.status).not.toBe("PAID");
    expect(Number(created.total)).toBe(UNIT_PRICE * QUANTITY);

    const webhook = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_APPROVED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
    });
    expect(webhook.status).toBe(200);

    const paid = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).toBeTruthy();
    expect(paid.payment?.transactionId).toBeTruthy();

    const stockAfter = await readProductStock(SEEDED_STORE_ID, PRODUCT_ID);
    expect(stockAfter).toBe(stockBefore - QUANTITY);
  });

  test("el pago rechazado cancela el pedido y no lo marca pagado", async ({
    page,
  }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);

    const webhook = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_REJECTED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
    });
    expect(webhook.status).toBe(200);

    const rejected = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(rejected.status).toBe("CANCELLED");
    expect(rejected.paidAt).toBeFalsy();
  });

  test("la anulación después del cobro también cancela el pedido", async ({
    page,
  }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    const reference = created.orderNumber || orderId;
    const total = Number(created.total);

    expect(
      (
        await deliverBoldWebhook({
          storeId: SEEDED_STORE_ID,
          type: "SALE_APPROVED",
          reference,
          total,
        })
      ).status,
    ).toBe(200);
    expect((await readOrderFromAdmin(SEEDED_STORE_ID, orderId)).status).toBe(
      "PAID",
    );

    const voided = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "VOID_APPROVED",
      reference,
      total,
    });
    expect(voided.status).toBe(200);

    expect((await readOrderFromAdmin(SEEDED_STORE_ID, orderId)).status).toBe(
      "CANCELLED",
    );
  });

  test("una firma que no corresponde no mueve el pedido", async ({ page }) => {
    const orderId = await placeOnlineOrder(page);
    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);

    const forged = await deliverBoldWebhook({
      storeId: SEEDED_STORE_ID,
      type: "SALE_APPROVED",
      reference: created.orderNumber || orderId,
      total: Number(created.total),
      secretKey: "una-clave-que-no-es",
    });
    expect(forged.status).toBe(400);

    const untouched = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(untouched.status).toBe(created.status);
    expect(untouched.paidAt).toBeFalsy();
  });
});
