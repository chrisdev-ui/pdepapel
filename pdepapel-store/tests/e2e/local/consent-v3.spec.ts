import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Aviso de privacidad v3 en 390 y 1280: una línea, «Solo necesarias» y
 * «Aceptar todo» del mismo tamaño, «Configurar» abre Analítica y Publicidad
 * apagadas; el píxel de TikTok solo carga con «Publicidad» y la referencia
 * del producto es la del feed. Necesita IDs de prueba en el build (sin GA no
 * hay aviso; la petición del SDK de TikTok se responde aquí con un script vacío):
 *
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-TEST000000 NEXT_PUBLIC_TIKTOK_PIXEL_ID=TESTPIXEL0000 \
 *     npm run test:e2e:local -- tests/e2e/local/consent-v3.spec.ts
 */
const SHOTS = path.resolve(__dirname, "../../../tmp/consent-v3-shots");

for (const viewport of [
  { name: "telefono-390", width: 390, height: 844 },
  { name: "computador-1280", width: 1280, height: 800 },
]) {
  test(`aviso y configuración en ${viewport.name}`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const banner = page.getByRole("region", { name: "Preferencias de privacidad" });
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText("Usamos cookies para analizar la tienda y medir nuestros anuncios.");
    const onlyNecessary = banner.getByRole("button", { name: "Solo necesarias" });
    const acceptAll = banner.getByRole("button", { name: "Aceptar todo" });
    const [a, b] = [await onlyNecessary.boundingBox(), await acceptAll.boundingBox()];
    expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-aviso.png`) });

    await banner.getByRole("button", { name: "Configurar" }).click();
    const dialog = page.getByRole("dialog", { name: "Preferencias de privacidad" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("switch", { name: /Analítica/ })).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByRole("switch", { name: /Publicidad/ })).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByRole("button", { name: "Guardar" })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-configurar.png`) });
  });
}

test.describe("píxel de TikTok", () => {
  test.skip(!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID, "Define NEXT_PUBLIC_TIKTOK_PIXEL_ID de prueba para el build.");

  async function watchTikTok(page: import("@playwright/test").Page) {
    const requests: string[] = [];
    await page.route(/analytics\.tiktok\.com/, async (route) => {
      requests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* sdk de prueba */" });
    });
    await page.route(/(googletagmanager\.com|clarity\.ms)/, (route) => route.abort());
    return requests;
  }

  test("nada antes del permiso ni con «Solo necesarias»", async ({ page }) => {
    const requests = await watchTikTok(page);
    await page.goto("/producto/producto-feria-e2e", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("region", { name: "Preferencias de privacidad" });
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => typeof window.ttq)).toBe("undefined");

    await banner.getByRole("button", { name: "Solo necesarias" }).click();
    await page.waitForTimeout(1_500);
    expect(requests).toEqual([]);
  });

  test("con «Aceptar todo» carga una vez y la ficha manda ViewContent con la referencia del feed y un event_id", async ({ page }) => {
    const requests = await watchTikTok(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("region", { name: "Preferencias de privacidad" }).getByRole("button", { name: "Aceptar todo" }).click();
    await expect.poll(() => requests.filter((url) => url.includes("events.js?sdkid=")).length, { timeout: 15_000 }).toBe(1);

    await page.goto("/producto/producto-feria-e2e", { waitUntil: "domcontentloaded" });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            ((window.ttq ?? []) as unknown as unknown[][])
              .filter((entry) => Array.isArray(entry) && entry[0] === "track" && entry[1] === "ViewContent")
              .map((entry) => ({ parameters: entry[2], options: entry[3] })),
          ),
        { timeout: 30_000 },
      )
      .toEqual([
        expect.objectContaining({
          parameters: expect.objectContaining({
            contents: [expect.objectContaining({ content_id: "E2E-FAIR-PRODUCT", content_type: "product" })],
            currency: "COP",
          }),
          options: { event_id: expect.stringMatching(/^ViewContent-/) },
        }),
      ]);
    const payload = await page.evaluate(() => JSON.stringify(window.ttq));
    expect(payload).not.toMatch(/@|identify/);
  });
});
