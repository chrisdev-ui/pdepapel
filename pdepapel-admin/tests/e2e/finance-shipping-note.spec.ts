import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Te quedó libre» dice cuántas ventas del mes no llevan el envío por unidad
 * en su costo (2026-10-17), a 390 y 768 px. Crea una venta pagada de prueba
 * en la tienda E2E y la borra al final.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/finance-shipping-note.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/finance-shots");

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Nota de envío en Finanzas",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("envío no registrado en «Te quedó libre»", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");
  const db = createTestPrismaClient("finance-shipping-note");
  let orderIds: string[] = [];

  test.beforeAll(async () => {
    const make = (missing: boolean | null) =>
      db.order.create({
        data: {
          storeId,
          orderNumber: `E2E-ENVIO-${Date.now()}-${String(missing)}`,
          status: "PAID",
          type: "STANDARD",
          paidAt: new Date(),
          subtotal: 10000,
          total: 10000,
          totalProductCost: 6000,
          netProfit: 4000,
          productShippingMissing: missing,
        },
        select: { id: true },
      });
    // Una con el envío en el costo y otra sin él: la nota cuenta solo la segunda.
    orderIds = [(await make(false)).id, (await make(true)).id];
  });

  test.afterAll(async () => {
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
  ]) {
    test(`la nota sale bajo la ganancia a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/rendimiento?tab=detalle`);
      await expect(page.getByText("Te quedó libre", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
      const note = page.getByTestId("shipping-missing-note");
      await expect(note).toContainText(/Envío no registrado en \d+ ventas?: lo que te quedó libre puede ser menor\./);
      await expect(note).toBeVisible();
      const count = Number((await note.innerText()).match(/en (\d+) venta/)?.[1]);
      const missing = await db.order.count({
        where: { storeId, paidAt: { not: null }, OR: [{ productShippingMissing: null }, { productShippingMissing: true }] },
      });
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(missing);
      await note.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-te-quedo-libre.png`), fullPage: false });
    });
  }
});
