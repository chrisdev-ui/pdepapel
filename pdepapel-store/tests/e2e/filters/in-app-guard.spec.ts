import { skipPrivacyBanner } from "../helpers/public-page";
import { expect, test } from "../helpers/safe-test";

/**
 * El propósito original de la guarda (incidente 2026-10-06): el navegador
 * integrado envuelve `pushState` y su envoltorio lanza «Java object is gone».
 * Sin la guarda, abrir una ficha desde una tarjeta terminaba en el error
 * boundary. Solo corre con agentes de Instagram o Facebook.
 */
const JAVA_GONE = "Error invoking postMessage: Java object is gone";
const grid = '#catalog-results a[href^="/producto/"]';

for (const when of ["before", "after"] as const) {
  test(`una tarjeta abre la ficha aunque el envoltorio del navegador integrado lance (${when === "before" ? "instalado antes de la guarda" : "instalado después de hidratar"})`, async ({ page }) => {
    const ua = await page.evaluate(() => navigator.userAgent);
    test.skip(!/Instagram|FBAN|FBAV/.test(ua), "Solo en navegadores integrados.");
    await skipPrivacyBanner(page);
    await page.addInitScript(
      ({ message, when }) => {
        const wrap = () => {
          const original = window.history.pushState;
          window.history.pushState = function (...args: Parameters<History["pushState"]>) {
            original.apply(this, args);
            throw new Error(message);
          };
        };
        if (when === "before") wrap();
        else window.addEventListener("load", () => window.setTimeout(wrap, 3_000));
      },
      { message: JAVA_GONE, when },
    );

    await page.goto("/tienda", { waitUntil: "domcontentloaded" });
    await expect(page.locator(grid).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(when === "after" ? 5_000 : 1_500);
    const listingTitle = (await page.locator("h1").first().textContent())?.trim();

    await page.locator(grid).first().click();
    await page.waitForURL(/\/producto\//);
    await expect(page.getByText("Algo salió mal")).toHaveCount(0);
    await expect(page.locator("h1").first()).not.toHaveText(listingTitle ?? "");

    await page.goBack();
    await page.waitForURL(/\/tienda/);
    await expect(page.locator("h1").first()).toHaveText(listingTitle ?? "", { timeout: 10_000 });
  });
}
