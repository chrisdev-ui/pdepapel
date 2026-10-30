import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Mercado Libre B1 a 390 y 1280 px: el interruptor de escrituras (pausar con
 * el aviso de stock, la franja en todas las pestañas, reanudar) y el campo
 * «Alertas de Mercado Libre» en Ajustes. Con la base local de pruebas:
 *
 *   npm run test:e2e:prod -- tests/e2e/mercadolibre-writes-switch-viewports.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/mlb1-shots");
const CONNECTION_ID = "e2e-ml-writes-switch";

test.use({ trace: "off" });

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Mercado Libre: interruptor y alertas",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("Mercado Libre: interruptor de escrituras y alertas", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    const db = createTestPrismaClient("mlb1-writes-switch");
    // La tarjeta solo aparece con una cuenta de Mercado Libre; se crea una de prueba sin token.
    await db.marketplaceConnection.upsert({
      where: { id: CONNECTION_ID },
      create: { id: CONNECTION_ID, storeId, provider: "MERCADOLIBRE", status: "DISCONNECTED", sellerId: "e2e-seller" },
      update: {},
    });
    await db.storeSettings.upsert({
      where: { storeId },
      create: { storeId, mercadoLibreWritesPaused: false },
      update: { mercadoLibreWritesPaused: false, mercadoLibreWritesPausedAt: null, mercadoLibreWritesPausedBy: null },
    });
    await db.$disconnect();
  });

  test.beforeEach(async () => {
    const db = createTestPrismaClient("mlb1-writes-switch");
    await db.storeSettings.updateMany({ where: { storeId }, data: { mercadoLibreWritesPaused: false, mercadoLibreWritesPausedAt: null, mercadoLibreWritesPausedBy: null } });
    await db.$disconnect();
  });

  test.afterAll(async () => {
    const db = createTestPrismaClient("mlb1-writes-switch");
    await db.storeSettings.updateMany({
      where: { storeId },
      data: { mercadoLibreWritesPaused: false, mercadoLibreWritesPausedAt: null, mercadoLibreWritesPausedBy: null, mercadoLibreAlertEmails: null },
    });
    await db.marketplaceConnection.deleteMany({ where: { id: CONNECTION_ID } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "laptop-1280", width: 1280, height: 800 },
  ]) {
    test(`pausar, ver la franja, reanudar y guardar el correo de alertas a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const db = createTestPrismaClient("mlb1-writes-switch");

      await signIn(page, `/${storeId}/mercadolibre`);
      await expect(page).toHaveURL(new RegExp(`/${storeId}/mercadolibre`));
      const card = page.getByTestId("mercadolibre-writes-switch");
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText("Activas");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-activas.png`) });

      // Pausar: el diálogo avisa del riesgo de vender sin stock antes de confirmar.
      await card.getByRole("button", { name: "Pausar escrituras" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("puede vender unidades que ya no tienes");
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-dialogo.png`) });
      await dialog.getByRole("button", { name: "Pausar escrituras" }).click();
      await expect(page.getByTestId("mercadolibre-writes-paused-banner")).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText("Pausadas");
      await expect.poll(async () => (await db.storeSettings.findUnique({ where: { storeId } }))?.mercadoLibreWritesPaused).toBe(true);

      // La franja sigue en otra pestaña.
      await page.getByRole("tab", { name: "Publicaciones" }).click();
      await expect(page.getByTestId("mercadolibre-writes-paused-banner")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-franja-publicaciones.png`) });

      // Reanudar.
      await page.getByRole("tab", { name: "Resumen" }).click();
      await card.getByRole("button", { name: "Reanudar escrituras" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Reanudar" }).click();
      await expect(card).toContainText("Activas", { timeout: 30_000 });
      await expect(page.getByTestId("mercadolibre-writes-paused-banner")).toHaveCount(0);
      await expect.poll(async () => (await db.storeSettings.findUnique({ where: { storeId } }))?.mercadoLibreWritesPaused).toBe(false);

      // Ajustes: el correo propio de las alertas de Mercado Libre.
      await page.goto(`/${storeId}/configuracion`, { waitUntil: "domcontentloaded" });
      const alerts = page.getByLabel("Alertas de Mercado Libre");
      // La página hidrata y vuelve a pintar el formulario: escribir y guardar se repite hasta que la base lo tenga (guardar dos veces da lo mismo).
      await expect(async () => {
        await alerts.scrollIntoViewIfNeeded({ timeout: 2000 });
        await alerts.fill("alertas-ml@prueba.test", { timeout: 2000 });
        await page.getByRole("button", { name: "Guardar correos" }).click({ timeout: 2000 });
        await expect
          .poll(async () => (await db.storeSettings.findUnique({ where: { storeId } }))?.mercadoLibreAlertEmails, { timeout: 8000 })
          .toBe("alertas-ml@prueba.test");
      }).toPass({ timeout: 90_000 });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-ajustes-alertas.png`) });
      await db.$disconnect();
    });
  }
});
