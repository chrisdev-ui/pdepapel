import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { expect, test } from "./helpers/image-stub";

/**
 * «Bot en modo sombra» en Respuestas, en el teléfono y en el computador. Con
 * filas de prueba en la base local:
 *
 *   npm run test:e2e:seed-admin
 *   node scripts/with-e2e-env.mjs npx playwright test tests/e2e/shadow-report-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/shadow-shots");

test.use({ trace: "off" });

test.describe("modo sombra en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "computador-1440", width: 1440, height: 900 },
  ]) {
    test(`la tarjeta se lee en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba del modo sombra en distintos tamaños",
        redirectUrl: new URL(`/${storeId}/conversaciones/respuestas`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      const title = page.getByText("Bot en modo sombra", { exact: true });
      await expect(title).toBeVisible({ timeout: 60_000 });
      const card = title.locator("xpath=ancestor::div[contains(@class, 'border')][1]");
      await card.scrollIntoViewIfNeeded();
      // La página entra con un fundido: Playwright cuenta la opacidad 0 como visible.
      await expect
        .poll(
          () =>
            title.evaluate((el) => {
              let lowest = 1;
              for (let node: Element | null = el; node; node = node.parentElement) lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
              return lowest;
            }),
          { timeout: 60_000 },
        )
        .toBe(1);
      await expect(page.getByText("Mensajes evaluados")).toBeVisible();
      await expect(page.getByText("De qué iban los mensajes")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await card.screenshot({ path: path.join(SHOTS, `${viewport.name}.png`) });
    });
  }
});
