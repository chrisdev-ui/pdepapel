import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Clientas esperando» en 390, 768 y 1280: una clienta que lleva 45 min sin
 * respuesta sale en la tarjeta de Inicio (sin nombre ni texto), el número del
 * menú cuenta lo mismo en computador y en Configuración están el umbral y los
 * avisos del aparato. Con la base local de pruebas:
 *
 *   npm run test:e2e:prod -- tests/e2e/waiting-alert-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/esperando-shots");

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const conversations: string[] = [];

async function settled(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate(async (el: Element) => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
          let lowest = 1;
          for (let node: Element | null = el; node; node = node.parentElement) lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
          return lowest;
        }),
      { timeout: 60_000 },
    )
    .toBe(1);
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("«Clientas esperando» en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("waiting-alert-viewports");
    const since = new Date(Date.now() - 45 * 60_000);
    const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const conversation = await db.conversation.create({ data: { storeId, phone, status: "OPEN", lastInboundAt: since, contactName: "Clienta Que No Debe Verse" } });
    conversations.push(conversation.id);
    await db.conversationMessage.create({
      data: { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "texto que no debe verse en Inicio", createdAt: since, externalId: `wamid.e2e-${randomUUID()}` },
    });
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`Inicio y Configuración en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba de «Clientas esperando»",
        redirectUrl: new URL(`/${storeId}`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });

      const card = page.getByText("Clientas esperando").filter({ visible: true }).first();
      await expect(card).toBeVisible({ timeout: 90_000 });
      await settled(card);
      const row = page.getByRole("link", { name: /Conversación · hace (4[5-9]|5\d) min/ }).filter({ visible: true }).first();
      // El resumen de esperas se comparte 5 s por proceso (lib/whatsapp/waiting-alert.ts): si la prueba
      // anterior pintó el menú justo antes de sembrar, la primera carga puede traer la lectura previa.
      await expect(async () => {
        if (!(await row.isVisible())) await page.reload({ waitUntil: "domcontentloaded" });
        await expect(row).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 30_000 });
      await expect(page.getByText("Clienta Que No Debe Verse")).toHaveCount(0);
      await expect(page.getByText("texto que no debe verse en Inicio")).toHaveCount(0);
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-inicio.png`), fullPage: true });

      await page.goto(new URL(`/${storeId}/configuracion`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const field = page.getByText("Avisarme cuando una clienta lleve").filter({ visible: true }).first();
      await expect(field).toBeVisible({ timeout: 90_000 });
      // La página se vuelve a pintar al hidratarse: el desplazamiento se reintenta.
      await expect(async () => {
        await field.scrollIntoViewIfNeeded({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });
      await settled(field);
      await expect(page.getByText("Avisos en este aparato").filter({ visible: true }).first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-configuracion.png`), fullPage: false });
    });
  }
});
