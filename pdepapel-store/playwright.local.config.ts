import { defineConfig, devices } from "@playwright/test";

import {
  LOCAL_ADMIN_PORT,
  LOCAL_BOLD_IDENTITY_KEY,
  LOCAL_BOLD_SECRET_KEY,
  LOCAL_STORE_PORT,
  SEEDED_STORE_ID,
  localApiUrl,
} from "./tests/e2e/local/helpers/local-environment";

/**
 * La tienda se prueba contra una administración local y una base desechable,
 * así que aquí los pedidos se crean de verdad. Es lo contrario de
 * `playwright.config.ts`, que apunta a producción y por eso lleva el guardia
 * que corta cualquier petición capaz de crear un pedido.
 *
 * Antes de correr: `npm run test:db:up && npm run test:db:push &&
 * npm run test:e2e:seed-admin` en pdepapel-admin.
 */

const baseURL = `http://localhost:${LOCAL_STORE_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/local",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 120_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs npm run dev -- -p ${LOCAL_ADMIN_PORT}`,
      cwd: "../pdepapel-admin",
      url: `http://localhost:${LOCAL_ADMIN_PORT}/images/placeholder_1.png`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        // `process.loadEnvFile` no pisa lo que ya existe, así que inyectar aquí
        // es lo único que gana sobre el `.env` de la administración: sin esto
        // la firma se verificaría con la clave real de Bold.
        BOLD_ENVIRONMENT: "test",
        BOLD_SECRET_KEY: LOCAL_BOLD_SECRET_KEY,
        NEXT_PUBLIC_BOLD_IDENTITY_KEY: LOCAL_BOLD_IDENTITY_KEY,
      },
    },
    {
      // La tienda se sirve compilada, no en `dev`: en dev Next compila cada
      // ruta la primera vez que la piden y las esperas del checkout —pensadas
      // para un sitio ya construido— se agotaban esperando esa compilación.
      command: `npm run build && npm run start -- -p ${LOCAL_STORE_PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: {
        NEXT_PUBLIC_API_URL: localApiUrl(SEEDED_STORE_ID),
      },
    },
  ],
  projects: [
    {
      name: "local-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
