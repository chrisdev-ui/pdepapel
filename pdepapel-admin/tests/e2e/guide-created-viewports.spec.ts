import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * ORD-1793673348281-170 (2026-11-03): Paula pulsó «Guardar y crear guía», la guía salió en EnvioClick
 * y la página siguió ofreciendo el botón. En 390 y 1280:
 * 1. Su camino: la página recotiza sola, «Guardar y crear guía», confirmar. EnvioClick se dobla en el
 *    navegador (la guía se escribe en la base como lo haría el servidor): en cuanto responde, el botón
 *    desaparece y se ve el número de guía.
 * 2. Otra pestaña ya la creó: la ruta real responde «ya tenía guía» sin llamar a EnvioClick, y la
 *    página lo muestra en vez de un error.
 *
 *   npm run test:e2e:prod -- tests/e2e/guide-created-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.join(__dirname, "../../test-results/guide-created");

const RATES = [
  { idRate: 9101, idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: 13997, minimumInsurance: 0, totalCost: 13997, deliveryDays: 3, isCOD: false, codCost: null },
  { idRate: 9102, idCarrier: 2, idProduct: 1, carrier: "COORDINADORA", product: "Normal", flete: 19000, minimumInsurance: 500, totalCost: 19500, deliveryDays: 4, isCOD: false, codCost: null },
];
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const orderIds: string[] = [];

async function paidOrder(tag: string) {
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-E2E-GUIA-${tag}-${Date.now()}`,
      status: "PAID",
      paidAt: new Date(),
      type: "STANDARD",
      source: "STORE",
      salesChannel: "WHATSAPP",
      fullName: "Clienta Guía",
      email: "clienta@prueba.test",
      phone: "+573001234567",
      address: "Calle 1 # 2-3",
      neighborhood: "Centro",
      city: "Bogotá",
      department: "Bogotá D.C.",
      daneCode: "11001000",
      subtotal: 14000,
      total: 27997,
      orderItems: { create: [{ productId: "e2e-fair-product", name: "Producto feria E2E", quantity: 1, price: 14000 }] },
      payment: { create: { storeId, method: "Bold" } },
      shipping: {
        create: { storeId, provider: "ENVIOCLICK", status: "Preparing", envioClickIdRate: 9001, carrierName: "ENVIA", courier: "ENVIA", cost: 13997, flete: 13997 },
      },
    },
  });
  orderIds.push(order.id);
  return order;
}

async function openOrder(page: Page, orderId: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Crear guía de un pedido pagado",
    redirectUrl: new URL(`/${storeId}/pedidos/${orderId}`, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.route("**/api/*/shipment/quote", (route) =>
    route.fulfill({ json: { success: true, quotes: RATES, daneCode: "11001000", packageDimensions: { weight: 1, height: 10, width: 20, length: 25, type: "box", size: "S" } } }),
  );
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const notice = page.getByTestId("guide-created");
  const fits = await notice.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
}

test.describe("después de crear la guía, el pedido ya no ofrece crear otra", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("guide-created-viewports");
  });

  test.afterAll(async () => {
    if (!db) return;
    for (const orderId of orderIds) {
      await db.inventoryMovement.deleteMany({ where: { referenceId: orderId } });
      await db.shipping.deleteMany({ where: { orderId } });
      await db.paymentDetails.deleteMany({ where: { orderId } });
      await db.orderItem.deleteMany({ where: { orderId } });
      await db.order.deleteMany({ where: { id: orderId } });
    }
    await db.$disconnect();
  });

  for (const viewport of VIEWPORTS) {
    test(`«Guardar y crear guía» deja el número en pantalla, en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      const order = await paidOrder(`A${viewport.name}`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      let guideCalls = 0;
      await page.route(`**/api/*/orders/${order.id}/shipping/create-guide`, async (route) => {
        guideCalls += 1;
        await db.shipping.update({
          where: { orderId: order.id },
          data: { envioClickIdOrder: 4823557, trackingCode: "034059511182", status: "Shipped", guideError: null, guideAttemptedAt: null },
        });
        await route.fulfill({ json: { success: true, alreadyCreated: false, message: "Guía creada exitosamente", data: { idOrder: 4823557, tracker: "034059511182" } } });
      });
      await openOrder(page, order.id);

      // Como Paula: recotizar (su tarifa tenía más de 2 h) deja elegida una tarifa nueva
      // (mismo precio, otro idRate) que todavía no está guardada en el pedido.
      const requote = page.getByRole("button", { name: "Cotizar de nuevo" });
      await expect(requote).toBeEnabled({ timeout: 120_000 });
      await requote.scrollIntoViewIfNeeded();
      await requote.click();
      const freshRate = page.locator('label[for="rate-9101"]');
      await expect(freshRate).toBeVisible({ timeout: 120_000 });
      await freshRate.scrollIntoViewIfNeeded();
      await freshRate.click();
      const create = page.getByRole("button", { name: /Guardar y crear guía/ });
      await expect(create).toBeEnabled({ timeout: 120_000 });
      await create.scrollIntoViewIfNeeded();
      await create.click();
      await page.getByRole("button", { name: "Sí, crear la guía" }).click();

      const notice = page.getByTestId("guide-created");
      await expect(notice).toContainText("034059511182", { timeout: 60_000 });
      await expect(notice.getByRole("link", { name: "Ver la guía (PDF)" })).toBeVisible();
      await expect(page.getByRole("button", { name: /crear guía/i })).toHaveCount(0);
      expect(guideCalls).toBe(1);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-creada.png`), fullPage: true });

      // Recargar trae el mismo estado del servidor: la guía, sin botón para crear otra.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Guía de EnvioClick creada \(4823557\)/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("guide-created")).toContainText("034059511182");
      await expect(page.getByRole("button", { name: /crear guía/i })).toHaveCount(0);
    });

    test(`otra pestaña ya la creó: «Crear guía» responde con la que hay, en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      const order = await paidOrder(`B${viewport.name}`);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openOrder(page, order.id);
      const create = page.getByRole("button", { name: /crear guía/i });
      await expect(create).toBeEnabled({ timeout: 120_000 });

      // La otra pestaña crea la guía mientras esta sigue abierta con el botón.
      await db.shipping.update({
        where: { orderId: order.id },
        data: { envioClickIdOrder: 5550001, trackingCode: "TAB2GUIA", status: "Shipped" },
      });

      await create.scrollIntoViewIfNeeded();
      await create.click();
      const response = page.waitForResponse((r) => r.url().includes(`/orders/${order.id}/shipping/create-guide`), { timeout: 120_000 });
      await page.getByRole("button", { name: "Sí, crear la guía" }).click();
      const body = await (await response).json();
      expect(body).toMatchObject({ success: true, alreadyCreated: true, data: { idOrder: 5550001, tracker: "TAB2GUIA" } });

      await expect(page.getByTestId("guide-created")).toContainText("Este pedido ya tenía guía de EnvioClick", { timeout: 60_000 });
      await expect(page.getByTestId("guide-created")).toContainText("TAB2GUIA");
      await expect(page.getByRole("button", { name: /crear guía/i })).toHaveCount(0);
      await expectNoSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-otra-pestana.png`), fullPage: true });
    });
  }
});
