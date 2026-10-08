import { defineConfig, devices } from "@playwright/test";

/**
 * Regresiones de filtros y navegación del catálogo (auditoría 2026-10-08).
 * Solo lectura: corre contra producción por defecto, o contra `E2E_BASE_URL`.
 * Va aparte de `playwright.config.ts` porque usa WebKit, que el flujo semanal
 * de `public-health.yml` no instala.
 */
export default defineConfig({
  testDir: "./tests/e2e/filters",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 150_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://papeleriapdepapel.com",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "iphone-13-webkit", use: { ...devices["iPhone 13"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
  ],
});
