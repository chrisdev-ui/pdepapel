import { expect, Page, Route, test } from "@playwright/test";

import { gotoPublicPage, skipPrivacyBanner } from "./helpers/public-page";

/**
 * The checkout is exercised end to end with the admin API mocked in the
 * browser: shipping quotes, order creation and the online-payment handshake
 * never reach the real backend, so no order is created wherever this runs.
 */

const PRODUCT_ID = "checkout-flow-e2e-product";

const CART_STORAGE = {
  state: {
    items: [
      {
        id: PRODUCT_ID,
        slug: "checkout-flow-e2e-product",
        category: { id: "category-id", name: "Pruebas", typeId: "" },
        name: "Separador kawaii de prueba",
        description: "No se envía ni crea una orden.",
        price: "1500",
        stock: 20,
        isFeatured: false,
        isArchived: false,
        size: { id: "size-id", name: "", value: "" },
        color: { id: "color-id", name: "Pastel", value: "#fff" },
        design: { id: "design-id", name: "Kawaii" },
        images: [],
        reviews: [],
        sku: "E2E-FLOW",
        quantity: 2,
      },
    ],
  },
  version: 1,
};

const QUOTES = {
  success: true,
  daneCode: "05001000",
  packageDimensions: { weight: 0.2, height: 5, width: 20, length: 25 },
  quotes: [
    { idRate: 101, carrier: "COORDINADORA", product: "Normal", flete: 6630, minimumInsurance: 650, totalCost: 7280, deliveryDays: "2", isCOD: false },
    { idRate: 102, carrier: "COORDINADORA", product: "Normal", flete: 6630, minimumInsurance: 650, totalCost: 7280, deliveryDays: "2", isCOD: true },
    { idRate: 103, carrier: "ENVIA", product: "Normal", flete: 8117, minimumInsurance: 0, totalCost: 8117, deliveryDays: "3", isCOD: false },
    { idRate: 105, carrier: "RAPPI", product: "Dos horas", flete: 8950, minimumInsurance: 0, totalCost: 8950, deliveryDays: "0", isCOD: false },
    { idRate: 107, carrier: "TCC", product: "Normal", flete: 15272, minimumInsurance: 500, totalCost: 15772, deliveryDays: "1", isCOD: true },
  ],
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

async function seedCheckout(page: Page) {
  await skipPrivacyBanner(page);
  // Init scripts run on every navigation: seed only once per tab so a
  // second visit sees what the first one saved (cart, pending order).
  await page.addInitScript((cart) => {
    if (window.sessionStorage.getItem("pdp-e2e-seeded")) return;
    window.sessionStorage.setItem("pdp-e2e-seeded", "1");
    window.localStorage.setItem("cart-storage", JSON.stringify(cart));
    window.localStorage.removeItem("checkout-storage");
  }, CART_STORAGE);
}

async function mockQuotes(page: Page, body: unknown = QUOTES, status = 200) {
  await page.route("**/shipment/quote", (route) => json(route, status, body));
}

async function fillContact(page: Page) {
  const next = page.getByRole("button", { name: "Continuar a entrega" });
  await expect(next).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Paula Andrea Restrepo");
  await page.getByLabel(/Correo electrónico/).fill("paula@ejemplo.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3024686403");
  await page.getByLabel(/Documento de identidad/).fill("1047452823");
  await next.click();
  await expect(
    page.getByRole("heading", { name: "¿A dónde lo enviamos?" }),
  ).toBeVisible();
}

async function fillDelivery(page: Page) {
  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click();
  await city.fill("Medell");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await page.getByLabel(/^Dirección \*/).fill("Calle 12 AA Sur #55D-30");
}

async function goToPayment(page: Page) {
  await expect(page.locator('[id^="rate-"]').first()).toBeAttached({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  await expect(
    page.getByRole("heading", { name: "Pago y confirmación" }),
  ).toBeVisible();
}

test.describe("checkout en tres pasos", () => {
  // Each test walks the whole flow (three steps plus mocked requests).
  test.describe.configure({ timeout: 120_000 });

  test("valida los datos con mensajes claros y avanza a la entrega", async ({
    page,
  }) => {
    await seedCheckout(page);
    await gotoPublicPage(page, "/finalizar-compra");

    const next = page.getByRole("button", { name: "Continuar a entrega" });
    await expect(next).toBeVisible({ timeout: 30_000 });
    await next.click();
    await expect(page.getByText("Escribe tu nombre y apellidos")).toBeVisible();
    await expect(
      page.getByText("Escribe un celular válido, por ejemplo 300 123 4567"),
    ).toBeVisible();
    await expect(page.getByText("Escribe el número de tu documento")).toBeVisible();

    await fillContact(page);
    await expect(page.getByText("Paso 2", { exact: false })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continuar al pago" }),
    ).toBeVisible();
  });

  test("cotiza el envío sola, deja una tarifa por transportadora y preselecciona la más económica", async ({
    page,
  }) => {
    await seedCheckout(page);
    await mockQuotes(page);
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);

    const rates = page.locator('[id^="rate-"]');
    await expect(rates).toHaveCount(4, { timeout: 20_000 });
    await expect(page.locator("#rate-102")).toHaveAttribute(
      "data-state",
      "checked",
    );
    await expect(page.getByText("Más económica")).toBeVisible();
    await expect(page.getByText("Más rápida")).toBeVisible();
    await expect(page.getByText("Contraentrega disponible").first()).toBeVisible();

    await goToPayment(page);
    await expect(page.getByRole("button", { name: /Pagar \$/ })).toBeVisible();
    await expect(page.getByText("Verificamos cada transferencia manualmente")).toBeVisible();
    await expect(page.locator("#payment-Bold")).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  test("ofrece reintentar cuando la cotización falla y una salida cuando no hay cobertura", async ({
    page,
  }) => {
    await seedCheckout(page);
    let quoteCalls = 0;
    await page.route("**/shipment/quote", (route) => {
      quoteCalls += 1;
      return quoteCalls === 1
        ? json(route, 500, { message: "Servicio no disponible" })
        : json(route, 200, { ...QUOTES, quotes: [] });
    });
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);

    const alert = page
      .getByRole("alert")
      .filter({ hasText: "No pudimos calcular el envío" });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await alert.getByRole("button", { name: "Volver a calcular" }).click();

    await expect(
      page.getByText("Ninguna transportadora cubre esta dirección por ahora."),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Acordar por WhatsApp" }).last().click();
    await expect(page.locator("#opt-custom_whatsapp")).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  test("transferencia: crea el pedido sin pasarela y vacía el carrito al ir al pedido", async ({
    page,
  }) => {
    await seedCheckout(page);
    await mockQuotes(page);
    const idempotencyKeys: string[] = [];
    await page.route("**/orders", (route) => {
      idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
      return json(route, 200, {
        id: "e2e-transfer-order",
        orderNumber: "ORD-E2E-TRANSFER",
        total: 10280,
        status: "CREATED",
      });
    });
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);
    await goToPayment(page);

    await page.getByText("Transferencia bancaria", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Confirmar pedido" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    await page.waitForURL(/\/pedido\/e2e-transfer-order/, { timeout: 30_000 });
    const cart = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("cart-storage") ?? "{}"),
    );
    expect(cart.state?.items ?? []).toHaveLength(0);
    // Every attempt carries an idempotency key so a retry never duplicates the order.
    expect(idempotencyKeys[0]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  test("pago en línea: conserva el carrito, recuerda el pedido pendiente y ofrece pagarlo", async ({
    page,
  }) => {
    await seedCheckout(page);
    await mockQuotes(page);
    await page.route("**/checkout", (route) =>
      json(route, 200, {
        order: {
          id: "e2e-online-order",
          orderNumber: "ORD-E2E-ONLINE",
          total: 10280,
          status: "CREATED",
        },
        boldData: {
          orderNumber: "ORD-E2E-ONLINE",
          amount: 10280,
          currency: "COP",
          identityKey: "test",
          integritySignature: "test",
          redirectionUrl: "https://example.com",
        },
      }),
    );
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);
    await goToPayment(page);

    await page.getByRole("button", { name: /Pagar \$/ }).click();
    await page.waitForURL(/\/pedido\/e2e-online-order\?autoPay=true/, {
      timeout: 30_000,
    });

    const storage = await page.evaluate(() => ({
      cart: JSON.parse(window.localStorage.getItem("cart-storage") ?? "{}"),
      checkout: JSON.parse(
        window.localStorage.getItem("checkout-storage") ?? "{}",
      ),
    }));
    expect(storage.cart.state?.items).toHaveLength(1);
    expect(storage.checkout.state?.pendingOrder?.id).toBe("e2e-online-order");

    await gotoPublicPage(page, "/finalizar-compra");
    await expect(
      page.getByText("Tienes un pedido pendiente de pago"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Pagar ahora" })).toHaveAttribute(
      "href",
      /\/pedido\/e2e-online-order\?autoPay=true/,
    );
  });

  test("sin stock al confirmar: muestra qué ajustar en vez de fallar", async ({
    page,
  }) => {
    await seedCheckout(page);
    await mockQuotes(page);
    await page.route("**/orders", (route) =>
      json(route, 422, {
        error: "Stock insuficiente",
        details: {
          items: [
            {
              productId: PRODUCT_ID,
              productName: "Separador kawaii de prueba",
              available: 1,
              requested: 2,
            },
          ],
        },
      }),
    );
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);
    await goToPayment(page);

    await page.getByText("Transferencia bancaria", { exact: true }).click();
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    const conflict = page.getByRole("alert").filter({
      hasText: "Se agotó parte de tu pedido",
    });
    await expect(conflict).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Confirmar pedido" })).toBeDisabled();
    await conflict.getByRole("button", { name: "Dejar 1" }).click();
    await expect(conflict).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirmar pedido" })).toBeEnabled();

    const cart = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("cart-storage") ?? "{}"),
    );
    expect(cart.state?.items?.[0]?.quantity).toBe(1);
  });

  test("fallo del servidor al crear el pedido: avisa, no cobra y conserva el formulario", async ({
    page,
  }) => {
    await seedCheckout(page);
    await mockQuotes(page);
    await page.route("**/checkout", (route) =>
      json(route, 500, { error: "Algo salió mal" }),
    );
    await gotoPublicPage(page, "/finalizar-compra");
    await fillContact(page);
    await fillDelivery(page);
    await goToPayment(page);

    await page.getByRole("button", { name: /Pagar \$/ }).click();
    await expect(
      page.getByText("No pudimos crear tu pedido", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/finalizar-compra/);
    await expect(page.getByRole("button", { name: /Pagar \$/ })).toBeEnabled();
    await expect(page.getByText("Paula Andrea Restrepo")).toBeVisible();
  });
});
