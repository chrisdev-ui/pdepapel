import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Reservas de varios productos en 360, 390, 768 y 1280: desde un «Pedido
 * solicitado» de WhatsApp se reservan los dos productos con un solo
 * «Reservar»; la tarjeta de la lista los resume; el detalle cambia una
 * cantidad, abre «Agregar productos», convierte con el resumen del pedido
 * (en 390) o libera. La hoja ocupa todo el ancho en el teléfono y nada se
 * desborda a lo ancho. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/reservations-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/reservas-shots");

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
/** Archivado en la semilla: solo esta spec lo activa, así las demás siguen viendo un solo producto activo. */
const RESERVE_PRODUCT = "e2e-reserve-product";
const conversations: string[] = [];

/** La página entra con un fundido y la hoja se desliza: Playwright cuenta opacidad 0 y media animación como visibles. */
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

/** Un «Pedido solicitado» del bot con los dos productos de la tienda de pruebas. */
async function orderRequestConversation(name: string, phone: string) {
  const conversation = await db.conversation.create({
    data: { storeId, phone, contactName: name, status: "NEEDS_OWNER", lastOutboundAt: new Date(), lastInboundAt: new Date(Date.now() - 60_000) },
  });
  conversations.push(conversation.id);
  await db.conversationMessage.createMany({
    data: [
      { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "Quiero la libreta y el producto de feria", status: "RECEIVED", createdAt: new Date(Date.now() - 60_000) },
      {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sentBy: "BOT",
        body: "Le paso tu pedido a Paula.",
        status: "SENT",
        metadata: {
          orderRequest: {
            status: "pending",
            items: [
              { productId: "e2e-fair-product", name: "Producto feria E2E", quantity: 1, unitPrice: 10000, stockConfirmed: true },
              { productId: "e2e-reserve-product", name: "Libreta reservas E2E", quantity: 1, unitPrice: 8000, stockConfirmed: true },
            ],
          },
        },
      },
    ],
  });
  return conversation.id;
}

test.describe("reservas en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("reservations-viewports");
    await db.product.update({ where: { id: RESERVE_PRODUCT }, data: { isArchived: false, stock: 12, reservedUnits: 0 } });
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.product.update({ where: { id: RESERVE_PRODUCT }, data: { isArchived: true } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-360", width: 360, height: 780, phone: "3009990360" },
    { name: "telefono-390", width: 390, height: 844, phone: "3009990390" },
    { name: "tableta-768", width: 768, height: 1024, phone: "3009990768" },
    { name: "computador-1280", width: 1280, height: 800, phone: "3009991280" },
  ]) {
    test(`varios productos, detalle y cierre en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const customer = `Clienta WA ${viewport.width}`;
      const conversationId = await orderRequestConversation(customer, viewport.phone);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba de reservas en distintos tamaños",
        redirectUrl: new URL(`/${storeId}/conversaciones/${conversationId}`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });

      // WhatsApp: un solo «Reservar» con los dos productos pedidos.
      const reserveAll = page.getByRole("button", { name: "Reservar los 2 productos" });
      await expect(reserveAll).toBeVisible({ timeout: 90_000 });
      await settled(reserveAll);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-whatsapp.png`) });
      const sheet = page.getByRole("dialog", { name: "Reservar" });
      await expect(async () => {
        await reserveAll.click();
        await expect(sheet).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await settled(sheet);
      const box = (await sheet.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      if (viewport.width < 768) expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
      await expect(sheet.getByTestId("reserve-line")).toHaveCount(2);
      await expect(sheet.getByLabel("Nombre")).toHaveValue(customer);
      await expect(sheet.getByTestId("reserve-total")).toContainText("2 productos · 2 unidades");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-hoja.png`) });
      await sheet.getByRole("button", { name: "Reservar 2 unidades" }).click();
      await expect(sheet).toBeHidden({ timeout: 30_000 });
      await expect(page.getByText("Reservado 1")).toHaveCount(2, { timeout: 30_000 });

      // En dos columnas, una reserva de un producto queda junto a la de dos: la corta no se estira a la alta.
      const twoColumns = viewport.width >= 1024;
      let shortId: string | null = null;
      if (twoColumns) {
        const created = await page.request.post(new URL(`/api/${storeId}/stock-reservations`, baseURL).toString(), {
          data: { items: [{ productId: RESERVE_PRODUCT, quantity: 1 }], customerName: `Clienta corta ${viewport.width}`, days: 3 },
        });
        expect(created.status()).toBe(201);
        shortId = (await created.json()).reservation.id;
      }

      // La lista resume la reserva y lleva al detalle.
      await page.goto(new URL(`/${storeId}/reservas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("reservation-card").filter({ hasText: customer });
      await expect(card).toBeVisible({ timeout: 60_000 });
      await settled(card);
      await expect(card.getByText("2 productos · 2 unidades")).toBeVisible();
      await expect(card.getByTestId("expiry-chip")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      if (twoColumns) {
        const shortCard = page.getByTestId("reservation-card").filter({ hasText: `Clienta corta ${viewport.width}` });
        await settled(shortCard);
        const tall = (await card.boundingBox())!;
        const short = (await shortCard.boundingBox())!;
        expect(Math.abs(tall.y - short.y), "las dos tarjetas van en la misma fila").toBeLessThan(2);
        expect(short.height).toBeLessThan(tall.height - 10);
      }
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-3-lista.png`), fullPage: true });
      await card.getByTestId("reservation-open").click();
      await page.waitForURL(new RegExp(`/${storeId}/reservas/[^/?]+$`), { timeout: 60_000 });

      // Detalle: cambiar una cantidad queda en el historial.
      const lines = page.getByTestId("reservation-line");
      await expect(lines).toHaveCount(2, { timeout: 60_000 });
      await settled(lines.first());
      await expect(page.getByTestId("reservation-history")).toContainText("Agregó 1 unidad de");
      await expect(async () => {
        await lines.first().getByRole("button", { name: "Aumentar cantidad" }).click();
        await expect(lines.first().getByRole("button", { name: "Guardar" })).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await lines.first().getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByTestId("reservation-history")).toContainText(/Cambió .*: 1 → 2 unidades/, { timeout: 30_000 });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-4-detalle.png`), fullPage: true });

      // «Agregar productos» abre la hoja sobre esta reserva, sin pedir la clienta.
      await page.getByRole("button", { name: "Agregar productos" }).click();
      const addSheet = page.getByRole("dialog", { name: "Agregar a la reserva" });
      await expect(addSheet).toBeVisible({ timeout: 30_000 });
      await settled(addSheet);
      await expect(addSheet.getByLabel("Nombre")).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-5-agregar.png`) });
      await addSheet.getByRole("button", { name: "Cancelar" }).click();
      await expect(addSheet).toBeHidden({ timeout: 30_000 });

      if (viewport.width === 390) {
        // Convertir muestra el resumen del pedido antes de crearlo.
        await page.getByRole("button", { name: "Convertir en pedido" }).click();
        const summary = page.getByTestId("convert-summary");
        await expect(summary).toBeVisible({ timeout: 30_000 });
        await expect(summary).toContainText("Producto feria E2E");
        await expect(summary).toContainText("Libreta reservas E2E");
        await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-6-resumen.png`) });
        const detailUrl = page.url();
        await page.getByRole("button", { name: "Crear el pedido" }).click();
        await page.waitForURL(new RegExp(`/${storeId}/pedidos/[^/?]+$`), { timeout: 120_000 });
        await expect(page.getByText("Libreta reservas E2E").first()).toBeVisible({ timeout: 90_000 });

        await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("converted-note")).toContainText("Se edita desde el pedido", { timeout: 60_000 });
        await expect(page.getByRole("button", { name: "Agregar productos" })).toHaveCount(0);
        await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-7-convertida.png`), fullPage: true });
      }

      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "¿Liberar esta reserva?" });
      await expect(async () => {
        await page.getByRole("button", { name: "Liberar" }).first().click();
        await expect(confirm).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await settled(confirm);
      await confirm.getByRole("button", { name: "Liberar" }).click();
      await expect(page.getByText("Liberado", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("reservation-history")).toContainText("Liberó la reserva", { timeout: 30_000 });
      if (shortId) {
        const released = await page.request.patch(new URL(`/api/${storeId}/stock-reservations/${shortId}`, baseURL).toString(), { data: { action: "liberar" } });
        expect(released.ok()).toBe(true);
      }
    });
  }
});
