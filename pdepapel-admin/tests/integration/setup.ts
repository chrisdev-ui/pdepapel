import { vi } from "vitest";

/**
 * Fills the baseline env contract with placeholders for variables that are
 * absent, so integration suites that (transitively) import lib/env.mjs
 * validate in CI, where only TEST_DATABASE_URL exists. Locally, Vitest loads
 * .env first, so real values win and nothing here overrides them.
 *
 * DATABASE_URL and NODE_ENV are intentionally not listed: scripts/with-test-env
 * sets them to the local pdepapel_test database and "development".
 */
const placeholders: Record<string, string> = {
  CLERK_SECRET_KEY: "sk_test_integration_placeholder",
  FRONTEND_STORE_URL: "http://127.0.0.1:3000",
  ADMIN_WEB_URL: "http://127.0.0.1:3001",
  CLOUDINARY_CLOUD_NAME: "integration-placeholder",
  CLOUDINARY_API_KEY: "integration-placeholder",
  CLOUDINARY_API_SECRET: "integration-placeholder",
  WOMPI_API_URL: "https://sandbox.wompi.invalid",
  WOMPI_API_KEY: "integration-placeholder",
  WOMPI_API_SECRET: "integration-placeholder",
  WOMPI_EVENTS_KEY: "integration-placeholder",
  WOMPI_INTEGRITY_KEY: "integration-placeholder",
  RESEND_API_KEY: "integration-placeholder",
  CRON_SECRET: "integration-placeholder",
  INTERNAL_API_SECRET: "integration-placeholder",
  ENVIOCLICK_API_KEY: "integration-placeholder",
  ENVIOCLICK_WEBHOOK_SECRET: "integration-placeholder-envioclick-secret",
  // min(24) en lib/env.mjs: si se acorta, la validación vuelve a fallar.
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "integration-placeholder-whatsapp-verify",
  BOLD_SECRET_KEY: "integration-placeholder-bold-secret",
  MIPAQUETE_API_KEY: "integration-placeholder",
  KV_REST_API_URL: "https://kv.integration.invalid",
  KV_REST_API_TOKEN: "integration-placeholder",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_integration_placeholder",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/crear-cuenta",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "integration-placeholder",
};

for (const [key, value] of Object.entries(placeholders)) {
  process.env[key] ??= value;
}

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
