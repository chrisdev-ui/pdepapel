import { defineConfig, devices } from "@playwright/test";

/**
 * Regresiones de filtros y navegación del catálogo (auditoría 2026-10-08).
 * Solo lectura: corre contra producción por defecto, o contra `E2E_BASE_URL`.
 * Va aparte de `playwright.config.ts` porque usa WebKit, que el flujo semanal
 * de `public-health.yml` no instala.
 */
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.31.98 (iPhone14,5; iOS 17_5; es_CO; es; scale=3.00; 1170x2532; 627400398)";
const FACEBOOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.43.109;]";

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
    // Con estos agentes se instala la guarda del historial (lib/history-guard.ts).
    { name: "instagram-iphone-webkit", use: { ...devices["iPhone 13"], userAgent: INSTAGRAM_IOS } },
    { name: "facebook-android-chromium", use: { ...devices["Pixel 7"], userAgent: FACEBOOK_ANDROID } },
  ],
});
