import { vi } from "vitest";

import { assertTestDatabaseEnv } from "../../scripts/lib/test-database.mjs";

assertTestDatabaseEnv(process.env, "vitest (integración)");


/**
 * Upstash nunca se llama de verdad en integración.
 *
 * Resolver el precio de una línea pasa por las ofertas vigentes, que se
 * cachean en Redis (`lib/discount-engine.ts`). Contra un Upstash real —o
 * inalcanzable— esa llamada se queda esperando en la red: la prueba muere por
 * tiempo a los 30 s y, de paso, deja el pedido a medio crear, así que la
 * limpieza de la fixture tampoco puede borrar la tienda y el fallo se lee como
 * si fuera de la base.
 *
 * Pasó dos veces seguidas en archivos distintos —cápsulas y punto de venta— y
 * las dos se veían como fallos de otra cosa. Estas pruebas van contra el MySQL
 * local: ninguna necesita salir a la red, y dieciséis archivos del código
 * tocan este camino, así que el doble vive aquí y no en cada prueba.
 */
vi.mock("@upstash/redis", () => ({
  Redis: class {
    static fromEnv() {
      return new this();
    }
    async get() {
      return null;
    }
    async set() {
      return "OK";
    }
    async del() {
      return 0;
    }
    async keys() {
      return [];
    }
  },
}));
