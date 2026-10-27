import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Borradores de WhatsApp (C2): «Crear pedido» en un chat sin carrito ni
 * teléfono (clienta con nombre de usuario) crea el borrador ligado y lo abre;
 * el borrador de «/pedido» muestra el valor acordado como referencia. En 390,
 * 768 y 1280 nada se sale de lado y el botón mide 44 px en el teléfono.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/whatsapp-drafts-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/borradores-shots");
const MARK = "e2e-borrador-";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const conversations: string[] = [];
let commandDraftId = "";

async function signIn(page: Page, to: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de borradores de WhatsApp",
    redirectUrl: new URL(to, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
];

test.describe("borradores de WhatsApp en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("whatsapp-drafts-viewports");
    for (const viewport of VIEWPORTS) {
      const conversation = await db.conversation.create({
        data: { storeId, bsuid: `CO.${MARK}${viewport.name}`, username: `${MARK.replace(/-/g, "_")}${viewport.name}`, status: "OPEN", lastInboundAt: new Date() },
      });
      await db.conversationMessage.create({
        data: { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "Hola, quiero el set de stickers", status: "RECEIVED" },
      });
      conversations.push(conversation.id);
    }
    const draft = await db.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${MARK}PEDIDO`,
        status: "DRAFT",
        type: "STANDARD",
        source: "WHATSAPP",
        fullName: "Clienta de WhatsApp",
        phone: "+573001234567",
        subtotal: 0,
        total: 0,
        draftAgreedAmount: 30000,
        draftOrigin: "whatsapp_command",
        internalNotes: "Creado por comando de WhatsApp.",
      },
    });
    commandDraftId = draft.id;
  });

  test.afterAll(async () => {
    if (!db) return;
    const linked = await db.conversation.findMany({ where: { id: { in: conversations } }, select: { orderId: true } });
    const orderIds = [commandDraftId, ...linked.map((c) => c.orderId).filter((id): id is string => Boolean(id))];
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.order.deleteMany({ where: { id: { in: orderIds }, storeId, status: "DRAFT" } });
    await db.$disconnect();
  });

  VIEWPORTS.forEach((viewport, index) => {
    test(`«Crear pedido» en un chat sin carrito en ${viewport.name}: crea el borrador ligado y lo abre`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/conversaciones/${conversations[index]}`);
      const button = page.getByRole("button", { name: "Crear pedido" });
      await expect(button).toBeVisible({ timeout: 90_000 });
      if (viewport.width < 640) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-chat.png`), fullPage: false });

      await button.click();
      await expect(page).toHaveURL(new RegExp(`/${storeId}/pedidos/[0-9a-f-]{36}$`), { timeout: 60_000 });
      const card = page.getByRole("region", { name: "Borrador de WhatsApp" });
      await expect(card).toBeVisible({ timeout: 90_000 });
      await expect(card).toContainText("Borrador creado desde Conversaciones");
      await expect(card).toContainText("Confirmar pedido");

      const linked = await db.conversation.findUniqueOrThrow({ where: { id: conversations[index] }, select: { orderId: true } });
      expect(page.url()).toContain(linked.orderId!);
      const order = await db.order.findUniqueOrThrow({ where: { id: linked.orderId! }, select: { status: true, draftOrigin: true, phone: true } });
      expect(order).toEqual({ status: "DRAFT", draftOrigin: "conversaciones", phone: "" });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-borrador-conversaciones.png`), fullPage: true });
    });

    test(`borrador de «/pedido» en ${viewport.name}: valor acordado como referencia y precios de la tienda`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/pedidos/${commandDraftId}`);
      const card = page.getByRole("region", { name: "Borrador de WhatsApp" });
      await expect(card).toBeVisible({ timeout: 90_000 });
      await expect(card).toContainText("con /pedido por WhatsApp");
      await expect(card).toContainText("Valor acordado por chat (referencia)");
      await expect(card).toContainText("30.000");
      await expect(card).toContainText("aplica un descuento");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-borrador-pedido.png`), fullPage: true });
    });
  });
});
