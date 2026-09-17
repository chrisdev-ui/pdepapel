import { test as base, expect } from "@playwright/test";

export type { Locator, Page, Route } from "@playwright/test";

/**
 * Cualquier método que no sea de lectura sobre `/orders` o `/checkout`, en
 * cualquier nivel: crear el pedido, la pasarela, la pasarela de un pedido ya
 * creado y todo lo que cuelga de `/orders/<id>` —incluida la guía de envío,
 * que reserva flete de verdad con la transportadora—.
 *
 * `restock-orders` no entra: el guion antes de «orders» no es un separador de
 * ruta, y esos pedidos son de la administración, no de la tienda.
 */
const ORDER_SURFACE = /\/(orders|checkout)(?:[/?#]|$)/;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * La suite corre contra producción (`playwright.config.ts` usa
 * `papeleriapdepapel.com` cuando no hay `E2E_BASE_URL`), y lo único que hoy
 * evita que una prueba cree un pedido real es que cada quien acierte con su
 * `page.route`. Este guardia es la red debajo: se registra antes que los mocks
 * de cada prueba —así los suyos siguen ganando, porque Playwright resuelve del
 * último registrado al primero— y cualquier petición que se le escape a la
 * superficie de pedidos la corta antes de salir del navegador.
 *
 * Corta en vez de sólo avisar a propósito: con `retries` una prueba rota se
 * reintenta, y avisar después de los hechos llegaría tarde tres veces.
 */
export const test = base.extend<{ orderSurfaceGuard: void }>({
  orderSurfaceGuard: [
    async ({ page }, use, testInfo) => {
      const blocked: string[] = [];

      await page.route(ORDER_SURFACE, (route) => {
        const request = route.request();
        const method = request.method();

        if (READ_ONLY_METHODS.has(method)) return route.fallback();

        let url: URL;
        try {
          url = new URL(request.url());
        } catch {
          return route.fallback();
        }

        if (LOCAL_HOSTS.has(url.hostname)) return route.fallback();

        blocked.push(`${method} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      });

      await use();

      if (blocked.length === 0) return;

      const offenders = Array.from(new Set(blocked));
      throw new Error(
        [
          `Esta prueba dejó salir ${offenders.length} petición(es) que habrían creado o modificado pedidos reales:`,
          ...offenders.map((entry) => `  · ${entry}`),
          "",
          `Se cortaron antes de salir del navegador, así que no se creó nada, pero el mock falta.`,
          `La suite apunta a ${testInfo.project.use.baseURL ?? "el sitio configurado"}.`,
          `Agrega el page.route que corresponda en la prueba antes de volver a ejecutarla.`,
        ].join("\n"),
      );
    },
    { auto: true },
  ],
});

export { expect };
