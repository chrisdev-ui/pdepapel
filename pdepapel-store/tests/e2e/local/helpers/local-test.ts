import { test as safeTest } from "../../helpers/safe-test";
import { resetOrderRateLimits } from "./local-environment";

export { expect } from "../../helpers/safe-test";
export type { Locator, Page, Route } from "../../helpers/safe-test";

/**
 * Las pruebas locales (panel y base de pruebas): antes de cada una se vacía el
 * límite de pedidos del Redis falso, para que el orden de la suite no decida
 * si una prueba que crea un pedido pasa.
 */
export const test = safeTest.extend<{ freshOrderRateLimits: void }>({
  freshOrderRateLimits: [
    async ({}, use) => {
      await resetOrderRateLimits();
      await use();
    },
    { auto: true },
  ],
});
