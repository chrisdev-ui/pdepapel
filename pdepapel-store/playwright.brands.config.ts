import { defineConfig, devices } from "@playwright/test";

/**
 * Marcas en la tienda (2026-10-17), a 390 y 768. Solo lectura. Va aparte de
 * `playwright.config.ts` porque depende de los datos de marcas. Contra
 * producción, `tests/e2e/brands/discover-brands.ts` saca las marcas de la API
 * pública; las variables `E2E_*` de `brands.spec.ts` siempre ganan, y otra
 * tienda necesita las suyas o `E2E_ADMIN_API_URL`.
 */
export default defineConfig({
  testDir: "./tests/e2e/brands",
  globalSetup: "./tests/e2e/brands/discover-brands.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://papeleriapdepapel.com",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone-390",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
});
