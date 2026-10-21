import { defineConfig, devices } from "@playwright/test";

import {
  LOCAL_ADMIN_PORT,
  LOCAL_FAKE_UPSTASH_PORT,
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
      // El mismo servidor aislado de las e2e de la administración: claves de
      // prueba salvo Clerk de desarrollo y sin red salvo la máquina local y
      // Clerk. Con `npm run dev` usaba el `.env` real (Upstash de producción).
      // Siempre escucha en 3101 (LOCAL_ADMIN_PORT).
      command: "node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs node scripts/e2e-dev-server.mjs",
      cwd: "../pdepapel-admin",
      // Puerto fijo del Redis falso: las pruebas vacían ahí el límite de pedidos.
      env: { E2E_FAKE_UPSTASH_PORT: String(LOCAL_FAKE_UPSTASH_PORT) },
      url: `http://localhost:${LOCAL_ADMIN_PORT}/images/placeholder_1.png`,
      // Nunca un servidor que ya estaba: podría ser un `npm run dev` con las claves reales.
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // La tienda se sirve compilada, no en `dev`: en dev Next compila cada
      // ruta la primera vez que la piden y las esperas del checkout —pensadas
      // para un sitio ya construido— se agotaban esperando esa compilación.
      // Con claves de prueba y sin red salvo local y Clerk, como la
      // administración. Siempre escucha en 3100 (LOCAL_STORE_PORT).
      command: "node scripts/e2e-store-server.mjs",
      url: baseURL,
      reuseExistingServer: false,
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
