import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Marcar como atendido» en Conversaciones, en el teléfono, la tableta y el
 * computador: desde la fila, dentro del chat y en bloque con el filtro
 * «Esperando a Paula». No se crea ningún mensaje y nada se desborda a lo
 * ancho. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e -- tests/e2e/conversations-attended.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/atendido-shots");
const MIN = 60 * 1000;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const created: string[] = [];

async function settled(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate(async (el) => {
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

async function waitingConversation(name: string, phone: string) {
  const now = Date.now();
  const conversation = await db.conversation.create({
    data: { storeId, phone, contactName: name, status: "NEEDS_OWNER", lastOutboundAt: new Date(now - 200 * MIN), lastInboundAt: new Date(now - 45 * MIN) },
  });
  created.push(conversation.id);
  await db.conversationMessage.createMany({
    data: [
      { conversationId: conversation.id, direction: "OUTBOUND", sentBy: "OWNER", body: "Hola, ya te ayudo", status: "SENT", createdAt: new Date(now - 200 * MIN) },
      { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "¿tienen agendas 2027?", status: "RECEIVED", createdAt: new Date(now - 45 * MIN) },
    ],
  });
  return conversation.id;
}

test.describe("marcar como atendido en distintos tamaños", () => {
  test.skip(!configured, "Necesita claves de desarrollo de Clerk.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("conversations-attended");
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: created } } });
    await db.conversation.deleteMany({ where: { id: { in: created } } });
    // El paso en bloque marca también las esperas de la siembra: se dejan como estaban.
    await db.conversation.updateMany({ where: { storeId }, data: { waitAttendedAt: null, waitAttendedBy: null } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844, phones: ["3000000003", "3000000004"] },
    { name: "tableta-768", width: 768, height: 1024, phones: ["3000000001", "3000000002"] },
    { name: "computador-1440", width: 1440, height: 900, phones: ["3001110000", "3001112233"] },
  ]) {
    test(`fila, chat y en bloque en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      const rowName = `Espera fila ${viewport.name}`;
      const threadName = `Espera chat ${viewport.name}`;
      const rowId = await waitingConversation(rowName, viewport.phones[0]);
      const threadId = await waitingConversation(threadName, viewport.phones[1]);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba de «Marcar como atendido»",
        redirectUrl: new URL(`/${storeId}/conversaciones?esperando=1`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });

      const row = page.getByRole("row").filter({ hasText: rowName });
      await expect(row).toBeVisible({ timeout: 90_000 });
      await settled(row);
      const rowButton = row.getByRole("button", { name: "Marcar como atendido" });
      await expect(rowButton).toBeVisible();
      if (viewport.width < 640) expect((await rowButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-lista.png`) });

      await rowButton.click();
      await expect(page.getByText("Marcada como atendida", { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(row).toHaveCount(0, { timeout: 30_000 });
      await expect(page).toHaveURL(/\/conversaciones\?esperando=1$/);
      const attended = await db.conversation.findUnique({ where: { id: rowId } });
      expect(attended?.waitAttendedAt).not.toBeNull();
      expect(attended?.waitAttendedBy).toBe(clerkUserId);
      expect(await db.conversationMessage.count({ where: { conversationId: rowId } })).toBe(2);

      await page.goto(new URL(`/${storeId}/conversaciones/${threadId}`, baseURL).toString());
      const threadButton = page.getByRole("button", { name: "Marcar como atendido" });
      await expect(threadButton).toBeVisible({ timeout: 60_000 });
      await settled(threadButton);
      await expect(page.getByText(/Esperando a Paula · \d+ min/).first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-chat.png`) });

      // En bloque: la espera del chat (y cualquier otra de la tienda) se va de una vez.
      await page.goto(new URL(`/${storeId}/conversaciones?esperando=1`, baseURL).toString());
      const bulk = page.getByRole("button", { name: /Marcar todas como atendidas \(\d+\)/ });
      await expect(bulk).toBeVisible({ timeout: 60_000 });
      await settled(bulk);
      await bulk.click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("no se le envía nada a ninguna clienta");
      await dialog.screenshot({ path: path.join(SHOTS, `${viewport.name}-confirmar.png`) });
      await dialog.getByRole("button", { name: "Sí, marcar como atendidas" }).click();
      await expect(page.getByText("Nadie te está esperando")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("button", { name: "Esperando a Paula (0)" })).toBeVisible();
      expect((await db.conversation.findUnique({ where: { id: threadId } }))?.waitAttendedAt).not.toBeNull();
      expect(await db.conversationMessage.count({ where: { conversationId: threadId } })).toBe(2);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
