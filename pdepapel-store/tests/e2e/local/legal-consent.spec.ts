import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { fillContact, fillDeliveryWithoutCarrier, formButton, startCheckout } from "./helpers/checkout";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Ley 1581 y Estatuto del Consumidor en el checkout y el registro, a 390 y
 * 1280: la autorización con los dos enlaces justo encima del botón de pago,
 * «Precio final, incluye los impuestos aplicables» junto al total y la misma
 * autorización bajo el formulario de registro. No se envía ningún pedido.
 */
const SHOTS = path.resolve(process.cwd(), "../pdepapel-admin/output/screenshots/terminos");
const CONSENT_CHECKOUT = "Al finalizar tu compra aceptas los Términos y condiciones y autorizas el tratamiento de tus datos según la Política de privacidad.";

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

async function expectLinks(scope: ReturnType<Page["getByTestId"]>) {
  await expect(scope.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("href", "/politicas/terminos");
  await expect(scope.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/politicas/privacidad");
  await expect(scope.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("target", "_blank");
}

for (const viewport of [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 900 },
]) {
  test(`checkout a ${viewport.name}: autorización encima del botón y precio final`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(viewport);
    await startCheckout(page);
    await fillContact(page);
    await fillDeliveryWithoutCarrier(page);
    await page.getByText("Pago en línea", { exact: true }).click();

    const form = page.locator("#checkout-form form");
    const consent = form.getByTestId("legal-consent");
    await expect(consent).toHaveText(CONSENT_CHECKOUT);
    await expectLinks(consent);
    const pay = formButton(page, /^Pagar /);
    await pay.scrollIntoViewIfNeeded();
    const consentBox = (await consent.boundingBox())!;
    const payBox = (await pay.boundingBox())!;
    // Justo encima: la autorización termina antes del botón y no hay nada grande en medio.
    expect(consentBox.y + consentBox.height).toBeLessThanOrEqual(payBox.y + 1);
    expect(payBox.y - (consentBox.y + consentBox.height)).toBeLessThan(80);
    await expect(page.getByText("políticas de entrega y cambios")).toHaveCount(0);

    const notes = page.getByTestId("checkout-final-price-note");
    await expect(notes.first()).toHaveText("Precio final, incluye los impuestos aplicables");
    if (viewport.width >= 1024) await expect(page.locator("aside").getByTestId("checkout-final-price-note")).toBeVisible();

    await noHorizontalScroll(page);
    await page.screenshot({ path: path.join(SHOTS, `checkout-consentimiento-${viewport.name}.png`) });
  });

  test(`registro a ${viewport.name}: sin aviso propio, lo pide la casilla de Clerk`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await skipPrivacyBanner(page);
    await page.goto("/crear-cuenta");
    await expect(page.getByRole("heading", { level: 1, name: "Crea tu cuenta" })).toBeVisible();
    await expect(page.getByTestId("legal-consent")).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: path.join(SHOTS, `registro-consentimiento-${viewport.name}.png`) });
  });
}
