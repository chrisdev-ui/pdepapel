import { test as base, expect, type Page } from "@playwright/test";

export type { Locator, Page, Route } from "@playwright/test";

/**
 * Un PNG de 1×1 con el que se responden las fotos de Cloudinary durante las
 * pruebas: el navegador real de Playwright las descargaba del CDN de
 * producción en cada corrida (HeadlessChrome era el 6 % del ancho de banda
 * de septiembre de 2026) y ninguna prueba mira los píxeles. `E2E_REAL_IMAGES=1`
 * deja pasar las fotos de verdad para una revisión visual puntual.
 */
const CLOUDINARY_HOST = /(^|\.)res\.cloudinary\.com$/;
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

export async function stubCloudinaryImages(page: Page) {
  if (process.env.E2E_REAL_IMAGES === "1") return;
  await page.route(
    (url) => CLOUDINARY_HOST.test(url.hostname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "no-store", "x-e2e-stub": "cloudinary" },
        body: STUB_PNG,
      }),
  );
}

/** `test` del panel: igual que el de Playwright, con las fotos de Cloudinary respondidas en local. */
export const test = base.extend<{ cloudinaryStub: void }>({
  cloudinaryStub: [
    async ({ page }, use) => {
      await stubCloudinaryImages(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
