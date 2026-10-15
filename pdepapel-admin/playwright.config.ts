import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const healthCheckUrl = new URL("/images/placeholder_1.png", baseURL).toString();

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // `E2E_SERVER=production` (la puerta): build de producción ya compilado, ver
  // `scripts/e2e-production-server.mjs`. Sin él, `next dev` para una prueba suelta.
  webServer: process.env.E2E_ADMIN_BASE_URL
    ? undefined
    : process.env.E2E_SERVER === "production"
      ? {
          command: "node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs node scripts/e2e-production-server.mjs",
          url: healthCheckUrl,
          reuseExistingServer: false,
          timeout: 600_000,
        }
      : {
          command:
            "node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs npm run dev -- -p 3101",
          url: healthCheckUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
