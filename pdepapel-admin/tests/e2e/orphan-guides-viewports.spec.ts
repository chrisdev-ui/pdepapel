import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Guías hechas en EnvioClick: de Inicio a «Vincular» en dos toques, con el
 * pedido sugerido, «Avisar a la clienta» y el estado al que quedó; «Ocultar
 * (no es de un pedido)» pide confirmación. En 390, 768 y 1280 nada se sale de
 * lado y los botones miden 44 px en el teléfono. También el modal «Registrar
 * movimiento» con «Disponible». A 1440 deja las capturas del manual.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/orphan-guides-viewports.spec.ts
 *   (E2E_MANUAL_SHOTS=1 copia las capturas a content/manual/img)
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/guias-shots");
const MANUAL_IMG = path.resolve(__dirname, "../../content/manual/img");
const MARK = "e2e-guia-";
const GUIDE_BASE = 91_000_000;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const orders: string[] = [];

async function signIn(page: Page, to: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de guías sin pedido",
    redirectUrl: new URL(to, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Una guía sin pedido (entregada) y un pedido sin guía de hace dos días, sugerido para ella. */
async function seedGuide(index: number) {
  const idOrder = String(GUIDE_BASE + index);
  const trackingCode = `0340E2E${String(index).padStart(5, "0")}`;
  await db.shippingWebhookEvent.create({
    data: {
      storeId,
      idOrder,
      reason: "shipping_not_found",
      payload: {
        idOrder: Number(idOrder),
        carrier: "envia",
        trackingCode,
        events: [
          { statusStep: "Entregado", status: "Entregado", timestamp: "2026-10-27 19:01:00" },
          { statusStep: "En tránsito", status: "En tránsito", timestamp: "2026-10-26 09:00:00" },
        ],
      },
    },
  });
  const product = await db.product.findFirst({ where: { storeId, isArchived: false, isKit: false }, select: { id: true, name: true, price: true } });
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-${MARK}${index}-${Date.now()}`,
      status: "PAID",
      paidAt: new Date(),
      type: "STANDARD",
      source: "PANEL",
      fullName: "Clienta de prueba",
      phone: "+573001112233",
      email: "clienta-guia@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      createdAt: new Date(Date.now() - 2 * 86_400_000),
      subtotal: 25000,
      total: 25000,
      orderItems: product ? { create: [{ productId: product.id, name: product.name, quantity: 1, price: 25000 }] } : undefined,
      payment: { create: { storeId, method: "BankTransfer" } },
    },
  });
  orders.push(order.id);
  return { idOrder, trackingCode, orderNumber: order.orderNumber };
}

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
];

test.describe("guías hechas en EnvioClick", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("orphan-guides-viewports");
    await db.shippingWebhookEvent.deleteMany({ where: { storeId, idOrder: { startsWith: String(GUIDE_BASE).slice(0, 4) } } });
  });

  test.afterAll(async () => {
    if (!db) return;
    const shippings = await db.shipping.findMany({ where: { orderId: { in: orders } }, select: { id: true } });
    await db.shippingTrackingEvent.deleteMany({ where: { shippingId: { in: shippings.map((s) => s.id) } } });
    await db.orderNotification.deleteMany({ where: { orderId: { in: orders } } });
    await db.shipping.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.shippingWebhookEvent.deleteMany({ where: { storeId, idOrder: { startsWith: String(GUIDE_BASE).slice(0, 4) } } });
    await db.$disconnect();
  });

  VIEWPORTS.forEach((viewport, index) => {
    test(`Vincular en ${viewport.name}: sugerido, «Avisar a la clienta» y el estado al que quedó`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const seeded = await seedGuide(index);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/envios`);

      const card = page.getByTestId("orphan-guides-card");
      await expect(card).toBeVisible({ timeout: 90_000 });
      const row = page.getByTestId(`orphan-guide-${seeded.idOrder}`);
      await row.getByRole("button", { name: "Vincular a un pedido" }).click();
      const panel = row.getByTestId("orphan-guide-link-panel");
      const suggestion = panel.getByRole("button", { name: new RegExp(seeded.orderNumber) });
      await expect(suggestion).toBeVisible({ timeout: 60_000 });
      if (viewport.width < 640) {
        expect((await suggestion.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect((await panel.getByRole("button", { name: "Vincular", exact: true }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await expect(panel.getByText("Quítalo si el pedido ya se entregó o ya le avisaste.")).toBeVisible();
      await expect(panel.getByRole("checkbox", { name: "Avisar a la clienta" })).toBeChecked();
      await suggestion.click();
      await expect(suggestion).toHaveAttribute("aria-pressed", "true");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-vincular.png`), fullPage: false });

      await panel.getByRole("checkbox", { name: "Avisar a la clienta" }).click();
      await panel.getByRole("button", { name: "Vincular", exact: true }).click();
      await expect(page.getByText(`Guía vinculada a ${seeded.orderNumber}: Entregado.`, { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(`orphan-guide-${seeded.idOrder}`)).toHaveCount(0, { timeout: 60_000 });
      const shipping = await db.shipping.findFirstOrThrow({ where: { order: { orderNumber: seeded.orderNumber } }, select: { envioClickIdOrder: true, status: true } });
      expect(shipping).toEqual({ envioClickIdOrder: Number(seeded.idOrder), status: "Delivered" });
    });
  });

  test("«Ocultar (no es de un pedido)» pide confirmación y avisa que ya no se podrá vincular (390)", async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedGuide(7);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/envios`);
    const row = page.getByTestId(`orphan-guide-${seeded.idOrder}`);
    await expect(row).toBeVisible({ timeout: 90_000 });
    await row.getByRole("button", { name: "Ocultar (no es de un pedido)" }).click();
    const confirm = row.getByRole("alertdialog", { name: "Ocultar guía" });
    await expect(confirm).toContainText("ya no se podrá vincular a un pedido");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-ocultar.png"), fullPage: false });
    await confirm.getByRole("button", { name: "No" }).click();
    await expect(row.getByRole("button", { name: "Vincular a un pedido" })).toBeVisible();
  });

  test("capturas del manual a 1440: Inicio → guía sin pedido → Vincular", async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedGuide(9);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/${storeId}`);
    const item = page.locator("li", { hasText: /guías? de EnvioClick sin pedido/ }).getByRole("link", { name: "Vincular" });
    await expect(item).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: path.join(SHOTS, "manual-guias-inicio.jpg"), type: "jpeg", quality: 80 });
    await item.click();
    const row = page.getByTestId(`orphan-guide-${seeded.idOrder}`);
    await expect(row).toBeVisible({ timeout: 90_000 });
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, "manual-guias-envios.jpg"), type: "jpeg", quality: 80 });
    await row.getByRole("button", { name: "Vincular a un pedido" }).click();
    const suggestion = row.getByTestId("orphan-guide-link-panel").getByRole("button", { name: new RegExp(seeded.orderNumber) });
    await expect(suggestion).toBeVisible({ timeout: 60_000 });
    await suggestion.click();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, "manual-guias-vincular.jpg"), type: "jpeg", quality: 80 });
    // Solo al rehacer el manual: copiarlas siempre dejaría el árbol con cambios en cada corrida.
    if (process.env.E2E_MANUAL_SHOTS === "1") {
      for (const name of ["manual-guias-inicio", "manual-guias-envios", "manual-guias-vincular"]) {
        copyFileSync(path.join(SHOTS, `${name}.jpg`), path.join(MANUAL_IMG, `${name.replace("manual-", "")}.jpg`));
      }
    }
  });

  VIEWPORTS.forEach((viewport) => {
    test(`«Registrar movimiento» en ${viewport.name}: el producto dice «Disponible» y nada se sale de lado`, async ({ page }) => {
      test.setTimeout(300_000);
      const product = await db.product.findFirstOrThrow({ where: { storeId, isArchived: false, isKit: false }, select: { id: true, sku: true } });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/movimientos-inventario`);
      await page.getByRole("button", { name: "Registrar movimiento" }).first().click({ timeout: 90_000 });
      const search = page.getByRole("dialog").getByRole("combobox").first();
      await search.click();
      await page.keyboard.type(product.sku);
      await page.getByRole("option", { name: new RegExp(product.sku) }).first().click({ timeout: 60_000 });
      await expect(page.getByTestId("adjust-product-stock")).toContainText("Disponible", { timeout: 60_000 });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-movimiento.png`), fullPage: false });
    });
  });
});
