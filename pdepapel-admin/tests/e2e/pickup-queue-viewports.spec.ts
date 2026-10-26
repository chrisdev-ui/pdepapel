import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus, type PrismaClient } from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Por entregar en tienda» en 390, 768 y 1280: un pedido pagado para recoger
 * sale en su pestaña de Pedidos con «Marcar entregado», en Inicio como
 * «Entregar en tienda» y no en «Por despachar»; en el pedido, el diálogo dice
 * que no hay guía. En 1280 se confirma y el envío queda «Entregado». Con la
 * base local de pruebas:
 *
 *   npm run test:e2e:prod -- tests/e2e/pickup-queue-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/recoger-shots");
const PRODUCT = "e2e-fair-product";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const orders: string[] = [];

/** La página entra con un fundido: Playwright cuenta opacidad 0 como visible. */
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

async function paidPickupOrder(width: number) {
  const product = await db.product.findUniqueOrThrow({ where: { id: PRODUCT }, select: { name: true, price: true, sku: true } });
  const price = Number(product.price);
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-E2E-RECOGE-${width}-${randomUUID().slice(0, 6)}`,
      status: OrderStatus.PAID,
      type: OrderType.STANDARD,
      fullName: `Clienta Recoge ${width}`,
      phone: "+573001234567",
      email: `recoge-${width}@prueba.test`,
      address: "Recoge en tienda",
      city: "Medellín",
      department: "Antioquia",
      subtotal: price,
      total: price,
      paidAt: new Date(),
      orderItems: { create: [{ productId: PRODUCT, quantity: 1, name: product.name, price, sku: product.sku }] },
      payment: { create: { storeId, method: PaymentMethod.BankTransfer, transactionId: `REF-${width}` } },
      shipping: { create: { storeId, provider: ShippingProvider.NONE, status: ShippingStatus.Preparing } },
    },
  });
  orders.push(order.id);
  return order;
}

test.describe("«Por entregar en tienda» en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("pickup-queue-viewports");
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.shipping.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: orders } } });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844, confirm: false },
    { name: "tableta-768", width: 768, height: 1024, confirm: false },
    { name: "computador-1280", width: 1280, height: 800, confirm: true },
  ]) {
    test(`cola, Inicio y «Marcar entregado» en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const order = await paidPickupOrder(viewport.width);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba de la cola «Por entregar en tienda»",
        redirectUrl: new URL(`/${storeId}/pedidos?vista=por-entregar`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });

      // Pedidos: la pestaña propia, con el pedido y su siguiente paso.
      const row = page.getByText(order.orderNumber).filter({ visible: true }).first();
      await expect(row).toBeVisible({ timeout: 90_000 });
      await settled(row);
      await expect(page.getByRole("link", { name: "Marcar entregado" }).filter({ visible: true }).first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-pedidos.png`), fullPage: true });

      await page.goto(new URL(`/${storeId}/pedidos?vista=por-despachar`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      await expect(page.getByText(order.orderNumber)).toHaveCount(0, { timeout: 60_000 });

      // Inicio: «Entregar en tienda» en pendientes.
      await page.goto(new URL(`/${storeId}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const pending = page.getByText(`Entregar en tienda · ${order.orderNumber}`).filter({ visible: true }).first();
      await expect(pending).toBeVisible({ timeout: 90_000 });
      await settled(pending);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-inicio.png`), fullPage: true });

      // El pedido: «Marcar entregado» sin guía.
      await page.goto(new URL(`/${storeId}/pedidos/${order.id}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const deliver = page.getByRole("button", { name: "Marcar entregado" }).filter({ visible: true }).first();
      await expect(deliver).toBeVisible({ timeout: 90_000 });
      await settled(deliver);
      await expect(page.getByText("Siguiente paso: entregar en la tienda").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Marcar como enviado" })).toHaveCount(0);
      const dialog = page.getByRole("dialog", { name: "Marcar entregado" });
      await expect(async () => {
        await deliver.click();
        await expect(dialog).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await settled(dialog);
      await expect(dialog.getByText("no se crea guía", { exact: false })).toBeVisible();
      await expect(dialog.getByLabel(/guía/i)).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-3-dialogo.png`) });

      if (!viewport.confirm) {
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        return;
      }
      await dialog.getByRole("button", { name: "Sí, marcar entregado" }).click();
      await expect
        .poll(async () => {
          const saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipping: true } });
          return `${saved.status}/${saved.shipping?.status}`;
        }, { timeout: 60_000 })
        .toBe(`${OrderStatus.SENT}/${ShippingStatus.Delivered}`);
      await page.goto(new URL(`/${storeId}/pedidos?vista=por-entregar`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      await expect(page.getByText(order.orderNumber)).toHaveCount(0, { timeout: 60_000 });
    });
  }
});
