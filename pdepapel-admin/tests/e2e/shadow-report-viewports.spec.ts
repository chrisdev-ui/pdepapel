import { mkdirSync } from "node:fs";
import path from "node:path";

import { randomUUID } from "node:crypto";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Bot en modo sombra» en Respuestas, en el teléfono y en el computador. La
 * prueba crea sus propias filas de los últimos 7 días (el informe no mira más
 * atrás) y las borra al final. Con la base local:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e -- tests/e2e/shadow-report-viewports.spec.ts
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

  let db: PrismaClient;
  const runIds: string[] = [];
  test.beforeAll(async () => {
    db = createTestPrismaClient("shadow-report-viewports");
    const conversationId = `e2e-shadow-${randomUUID()}`;
    const rows = [
      { intent: "product.search", realOutcome: "replied_products", productsFound: true },
      { intent: "product.price", realOutcome: "escalated_no_match", productsFound: true },
      { intent: null, realOutcome: "replied_greeting", productsFound: null, classifierStatus: "skipped", skipReason: "owner_active", plannedCount: 0 },
    ];
    for (const row of rows) {
      const created = await db.whatsAppBotShadowRun.create({
        data: {
          storeId,
          conversationId,
          inboundMessageId: `e2e-shadow-${randomUUID()}`,
          plannedTypes: row.plannedCount === 0 ? [] : ["product_list"],
          plannedCount: row.plannedCount ?? 1,
          realTypes: ["text"],
          realCount: 1,
          classifierStatus: row.classifierStatus ?? "ok",
          skipReason: row.skipReason ?? null,
          intent: row.intent,
          realOutcome: row.realOutcome,
          productsFound: row.productsFound,
        },
        select: { id: true },
      });
      runIds.push(created.id);
    }
  });
  test.afterAll(async () => {
    await db.whatsAppBotShadowRun.deleteMany({ where: { id: { in: runIds } } });
    await db.$disconnect();
  });

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
      await expect(page.getByText("Mensajes evaluados", { exact: true })).toBeVisible();
      await expect(page.getByText("De qué iban los mensajes", { exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await card.screenshot({ path: path.join(SHOTS, `${viewport.name}.png`) });
    });
  }
});
