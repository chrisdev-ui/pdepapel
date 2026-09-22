import { expect, test } from "./helpers/safe-test";

import { gotoPublicPage } from "./helpers/public-page";

/**
 * La foto de una tarjeta se toca entera para abrir el producto.
 *
 * El botón de favoritos que se ve en táctil vivía sobre la esquina superior
 * derecha de la foto: 36 px encima de una imagen de 156 px en el teléfono, y
 * justo donde cae el pulgar. Tocar esa esquina no abría el producto, guardaba
 * en favoritos sin que nadie lo pidiera; el toque parecía muerto y encima
 * hacía algo a escondidas. Comprobado con un iPhone de verdad, tres productos
 * y tres de tres, antes de moverlo al pie de la tarjeta.
 *
 * Solo corre en el proyecto móvil: en escritorio ese botón no existe —manda
 * la capa que aparece al pasar el puntero— y la prueba no diría nada.
 */
test.describe("tarjeta de producto en táctil", () => {
  test.skip(
    ({ isMobile }) => !isMobile,
    "El botón táctil de favoritos solo existe sin puntero fino.",
  );

  /** Centra la tarjeta para que el encabezado pegajoso no se quede con el toque. */
  async function centrarTarjeta(page: import("@playwright/test").Page, indice: number) {
    await page.evaluate((i) => {
      const card = document.querySelectorAll("article")[i];
      const rect = card.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2),
        behavior: "instant",
      });
    }, indice);
    await page.waitForTimeout(400);
  }

  async function esquinaDeLaFoto(page: import("@playwright/test").Page, indice: number) {
    return page.evaluate((i) => {
      const card = document.querySelectorAll("article")[i];
      const img = card.querySelector("img")!.getBoundingClientRect();
      const enlace = card.querySelector('a[aria-label^="Ver "]')!;
      // El punto exacto donde estaba el corazón: 8 px de margen, botón de 36.
      return {
        href: enlace.getAttribute("href")!,
        x: img.right - 8 - 18,
        y: img.top + 8 + 18,
        // Lo que de verdad hay bajo el dedo en ese punto.
        bajoElDedo:
          document.elementFromPoint(img.right - 8 - 18, img.top + 8 + 18)
            ?.closest("button")
            ?.getAttribute("aria-label") ?? null,
      };
    }, indice);
  }

  for (const indice of [1, 3, 5]) {
    test(`tocar la esquina superior derecha de la foto abre el producto (tarjeta ${indice})`, async ({ page }) => {
      await gotoPublicPage(page, "/tienda");
      await page.waitForSelector("article");
      await centrarTarjeta(page, indice);

      const objetivo = await esquinaDeLaFoto(page, indice);

      // Nada de favoritos debe estar esperando ahí. Sin botón, `null`: es el
      // estado bueno, así que se compara sobre texto y no sobre la ausencia.
      expect(objetivo.bajoElDedo ?? "").not.toMatch(/favorito/i);

      await page.touchscreen.tap(objetivo.x, objetivo.y);

      await expect(page).toHaveURL(new RegExp(`${objetivo.href}$`), { timeout: 20_000 });
    });
  }

  test("el botón de favoritos sigue guardando cuando se toca a propósito", async ({ page }) => {
    await gotoPublicPage(page, "/tienda");
    await page.waitForSelector("article");
    await centrarTarjeta(page, 1);

    const favorito = page
      .locator("article")
      .nth(1)
      .getByRole("button", { name: /favoritos/i });
    await expect(favorito).toBeVisible();
    await expect(favorito).toHaveAttribute("aria-pressed", "false");

    await favorito.tap();

    await expect(favorito).toHaveAttribute("aria-pressed", "true");
    // Guardar no navega: la clienta se queda donde estaba.
    await expect(page).toHaveURL(/\/tienda/);
  });

  test("el botón de favoritos no se superpone a la foto", async ({ page }) => {
    await gotoPublicPage(page, "/tienda");
    await page.waitForSelector("article");

    const solapa = await page.evaluate(() => {
      const card = document.querySelector("article")!;
      const img = card.querySelector("img")!.getBoundingClientRect();
      // El de la capa de escritorio también dice «favoritos» pero está
      // oculto y mide 0: aquí interesa el que de verdad se ve al tocar.
      const fav = Array.from(card.querySelectorAll("button")).find(
        (b) =>
          /favorito/i.test(b.getAttribute("aria-label") ?? "") &&
          b.getBoundingClientRect().width > 0,
      );
      if (!fav) return { hayBoton: false };
      const r = fav.getBoundingClientRect();
      return {
        hayBoton: true,
        visible: r.width > 0,
        sobreLaFoto: !(r.right < img.left || r.left > img.right || r.bottom < img.top || r.top > img.bottom),
      };
    });

    expect(solapa.hayBoton).toBe(true);
    expect(solapa.visible).toBe(true);
    expect(solapa.sobreLaFoto).toBe(false);
  });
});
