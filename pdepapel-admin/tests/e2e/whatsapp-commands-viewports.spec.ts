import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Conversaciones → Comandos (C1): la bitácora de lo que Paula escribe con «/»
 * en su chat consigo misma. En 390, 768 y 1280 nada se sale de lado, la
 * respuesta se lee completa y «Ver pedido» mide 44 px en el teléfono.
 *
 *   npm run test:e2e:prod -- tests/e2e/whatsapp-commands-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/comandos-shots");
const ECHO_PREFIX = "wamid.e2e-comandos-";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;

async function signIn(page: Page, to: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de la bitácora de comandos",
    redirectUrl: new URL(to, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("Comandos por WhatsApp en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("whatsapp-commands-viewports");
    await db.whatsAppAdminCommand.deleteMany({ where: { storeId, echoId: { startsWith: ECHO_PREFIX } } });
    const order = await db.order.findFirst({ where: { storeId }, select: { id: true, orderNumber: true } });
    const now = Date.now();
    await db.whatsAppAdminCommand.createMany({
      data: [
        {
          storeId,
          echoId: `${ECHO_PREFIX}1`,
          command: "estado",
          args: order?.orderNumber ?? "ORD-E2E-1",
          status: "DONE",
          outcome: "ok",
          reply: `Pedido ${order?.orderNumber ?? "ORD-E2E-1"}: Enviado · Pago en línea\nEnvío: En tránsito · COORDINADORA, guía 12345678901234567890\nÚltimo movimiento 27 de oct, 3:12 p. m.: En centro de distribución con un texto largo de la transportadora (Bogotá)`,
          orderId: order?.id ?? null,
          delivered: 2,
          sentAt: new Date(now - 60_000),
        },
        { storeId, echoId: `${ECHO_PREFIX}2`, command: "ayuda", status: "STALE", outcome: "stale", reply: "Ese comando llegó con más de 10 minutos de retraso y no se ejecutó. Repítelo.", sentAt: new Date(now - 120_000) },
      ],
    });
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.whatsAppAdminCommand.deleteMany({ where: { storeId, echoId: { startsWith: ECHO_PREFIX } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1280", width: 1280, height: 800 },
  ]) {
    test(`bitácora en ${viewport.name}: se lee entera y nada se sale de lado`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/conversaciones/comandos`);
      await expect(page.getByRole("heading", { name: "Comandos por WhatsApp" })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("/estado", { exact: false }).first()).toBeVisible();
      await expect(page.getByText("Respondido", { exact: true })).toBeVisible();
      await expect(page.getByText("Llegó tarde", { exact: true })).toBeVisible();
      await expect(page.getByText("Aviso en 2 aparatos")).toBeVisible();
      const usage = page.getByTestId("command-usage");
      await expect(usage).toContainText("Últimos 14 días");
      await expect(usage).toContainText("/estado");
      await expect(usage).toContainText("bien");
      const link = page.getByRole("link", { name: "Ver pedido" });
      if (await link.count()) {
        const box = await link.first().boundingBox();
        if (viewport.width < 640) expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-comandos.png`), fullPage: true });
    });
  }

  test("Conversaciones en 390: el botón «Comandos» lleva a la bitácora sin desbordar", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/conversaciones`);
    const button = page.getByRole("button", { name: "Comandos" });
    await expect(button).toBeVisible({ timeout: 90_000 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-conversaciones.png"), fullPage: false });
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/${storeId}/conversaciones/comandos$`), { timeout: 60_000 });
  });
});
