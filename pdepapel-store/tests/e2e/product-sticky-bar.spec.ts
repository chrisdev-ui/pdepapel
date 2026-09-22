import { expect, test, type Page } from "./helpers/safe-test";

import { gotoPublicPage, skipPrivacyBanner } from "./helpers/public-page";

/**
 * La barra pegajosa de la ficha de producto.
 *
 * Existía para que el botón de agregar nunca se perdiera de vista, pero se
 * mostraba solo cuando el botón ya había pasado **por encima** del borde
 * superior (`boundingClientRect.top < 0`). En el teléfono ese botón nace por
 * debajo de la pantalla —entre 286 y 458 px, medido en cinco productos, en
 * iPhone 13 y Pixel 5—, así que `top` era positivo y la barra no salía: los
 * primeros ~550 px de cada ficha no tenían ningún botón de agregar en
 * pantalla. Es el punto donde GA4 ve caer el 72 % de quienes abren un
 * producto.
 *
 * La barra del carrito (`carrito/components/summary.tsx`) ya se comportaba
 * así, sin mirar la dirección; la ficha era la excepción.
 */

/** Toma la primera ficha del catálogo: no depende de ningún slug fijado. */
async function abrirUnProducto(page: Page) {
  await gotoPublicPage(page, "/tienda");
  await page.waitForSelector('a[aria-label^="Ver "]');
  const href = await page
    .locator('a[aria-label^="Ver "]')
    .first()
    .getAttribute("href");
  expect(href, "El catálogo no dio ningún producto que abrir.").toBeTruthy();
  await gotoPublicPage(page, href!);
  await page.waitForSelector('[data-testid="product-cta-row"]');
  return href!;
}

/**
 * El estado real de la barra, no el que sugiere el DOM: sigue montada cuando
 * está escondida —se oculta con `opacity`— así que `toBeVisible` diría que sí
 * siempre. Lo que manda es `aria-hidden` junto con la opacidad calculada.
 */
async function estadoDeLaBarra(page: Page) {
  return page.evaluate(() => {
    const barra = document.querySelector('[data-testid="product-sticky-bar"]');
    const fila = document.querySelector('[data-testid="product-cta-row"]');
    if (!barra || !fila) return null;
    const caja = fila.getBoundingClientRect();
    const estilo = window.getComputedStyle(barra);
    return {
      visible:
        barra.getAttribute("aria-hidden") === "false" &&
        Number(estilo.opacity) > 0.9,
      ariaHidden: barra.getAttribute("aria-hidden"),
      opacidad: estilo.opacity,
      botonArriba: caja.top,
      botonEnPantalla: caja.bottom > 0 && caja.top < window.innerHeight,
      alto: window.innerHeight,
      desplazamiento: window.scrollY,
    };
  });
}

test.describe("barra pegajosa de la ficha de producto", () => {
  test.beforeEach(async ({ page }) => {
    await skipPrivacyBanner(page);
  });

  test("aparece sin haber bajado, cuando el botón nace fuera de pantalla", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      !isMobile,
      "En escritorio el botón cabe en la primera pantalla; el caso es del teléfono.",
    );

    await abrirUnProducto(page);

    /*
     * Sin un solo `scroll`. Esa es la prueba: antes la única manera de ver la
     * barra era pasar de largo el botón, y aquí nunca se pasa de largo.
     *
     * Se reintenta porque el observador se conecta al hidratar y la primera
     * medición puede leerse antes; `toPass` corta en cuanto el estado llega.
     */
    await expect(async () => {
      const estado = await estadoDeLaBarra(page);
      expect(estado).not.toBeNull();
      expect(estado!.desplazamiento, "La prueba no debe haber bajado.").toBe(0);
      expect(
        estado!.botonEnPantalla,
        `El botón cabía en la primera pantalla (top=${estado!.botonArriba}, alto=${estado!.alto}); este caso ya no aplica y hay que revisar la prueba.`,
      ).toBe(false);
      expect(estado!.botonArriba, "El botón quedó por encima, no por debajo.").toBeGreaterThan(0);
      expect(
        estado!.visible,
        `La barra siguió escondida (aria-hidden=${estado!.ariaHidden}, opacidad=${estado!.opacidad}) sin ningún botón de agregar en pantalla.`,
      ).toBe(true);
    }).toPass({ timeout: 20_000 });
  });

  test("se esconde mientras el botón sí está a la vista", async ({ page }) => {
    await abrirUnProducto(page);

    // Al centro de la pantalla: ni asomado por abajo ni a punto de salir.
    await page.evaluate(() => {
      const fila = document.querySelector('[data-testid="product-cta-row"]')!;
      const caja = fila.getBoundingClientRect();
      window.scrollTo({
        top:
          window.scrollY +
          caja.top -
          (window.innerHeight / 2 - caja.height / 2),
        behavior: "instant",
      });
    });

    await expect(async () => {
      const estado = await estadoDeLaBarra(page);
      expect(estado!.botonEnPantalla).toBe(true);
      expect(
        estado!.visible,
        `La barra tapó la ficha teniendo el botón a la vista (aria-hidden=${estado!.ariaHidden}, opacidad=${estado!.opacidad}).`,
      ).toBe(false);
    }).toPass({ timeout: 15_000 });
  });

  test("sigue apareciendo cuando el botón queda por encima", async ({ page }) => {
    await abrirUnProducto(page);

    await page.evaluate(() => {
      const fila = document.querySelector('[data-testid="product-cta-row"]')!;
      const caja = fila.getBoundingClientRect();
      // Bien pasado de largo: el comportamiento que ya existía antes del cambio.
      window.scrollTo({
        top: window.scrollY + caja.bottom + window.innerHeight,
        behavior: "instant",
      });
    });

    await expect(async () => {
      const estado = await estadoDeLaBarra(page);
      expect(estado!.botonArriba).toBeLessThan(0);
      expect(estado!.visible).toBe(true);
    }).toPass({ timeout: 15_000 });
  });

  /**
   * «Envíos a toda Colombia» era un `span` sin destino en una fila de tres
   * sellos, y recogía toques de gente preguntando por el envío antes de
   * decidir. Ahora lleva a la política de envíos.
   */
  test("el sello de envíos lleva a la política de envíos", async ({ page }) => {
    await abrirUnProducto(page);

    const sello = page.getByRole("link", { name: /Envíos a toda Colombia/i });
    await expect(sello).toBeVisible();
    await expect(sello).toHaveAttribute("href", "/politicas/envios");

    await sello.scrollIntoViewIfNeeded();
    await sello.click();
    await expect(page).toHaveURL(/\/politicas\/envios$/, { timeout: 20_000 });
  });
});
