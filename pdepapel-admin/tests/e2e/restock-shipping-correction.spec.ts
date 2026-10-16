import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Corregir envío» en un pedido de aprovisionamiento con mercancía recibida,
 * a 390 y 768 px: la vista previa por producto cabe en el teléfono, lo que
 * viene de un pedido más reciente va aparte con su motivo, confirmar escribe
 * lo que mostró y deja un movimiento de 0 unidades por producto cambiado. Con
 * la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/restock-shipping-correction.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/shipping-correction-shots");
const PRODUCTS = ["e2e-fair-product", "e2e-reserve-product"] as const;
/** Tiene una recepción en un pedido posterior: aparece en «No se cambian». */
const LATER_PRODUCT = "e2e-archived-product";
const ALL = [...PRODUCTS, LATER_PRODUCT];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let originals: { id: string; transportationCost: number | null }[] = [];
let supplierId = "";
let orderId = "";
let laterOrderId = "";

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Lo que está encima en el centro del elemento es el elemento mismo. */
const uncovered = (locator: Locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= 0 && box.bottom <= window.innerHeight && top !== null && element.contains(top);
  });

test.describe("corregir el envío de un pedido recibido", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("restock-shipping-correction");
    originals = await db.product.findMany({ where: { id: { in: ALL } }, select: { id: true, transportationCost: true } });
    expect(originals).toHaveLength(3);
    supplierId = (await db.supplier.create({ data: { storeId, name: "Proveedor envío E2E" } })).id;
  });

  test.beforeEach(async () => {
    await db.product.updateMany({ where: { id: { in: ALL } }, data: { transportationCost: null } });
    // 3 × 30.000 + 10 × 1.000 + 5 × 2.000 = 110.000 de mercancía; recibido en parte, sin envío registrado.
    const order = await db.restockOrder.create({
      data: {
        storeId,
        supplierId,
        orderNumber: `PO-E2E-${Date.now()}`,
        status: "PARTIALLY_RECEIVED",
        totalAmount: 110000,
        shippingCost: 0,
        items: {
          create: [
            { productId: PRODUCTS[0], index: 0, quantity: 3, quantityReceived: 2, cost: 30000, subtotal: 90000 },
            { productId: PRODUCTS[1], index: 1, quantity: 10, quantityReceived: 10, cost: 1000, subtotal: 10000 },
            { productId: LATER_PRODUCT, index: 2, quantity: 5, quantityReceived: 5, cost: 2000, subtotal: 10000 },
          ],
        },
      },
    });
    orderId = order.id;
    await db.inventoryMovement.createMany({
      data: PRODUCTS.map((productId, index) => ({
        storeId,
        productId,
        type: "RESTOCK_RECEIVED" as const,
        quantity: index === 0 ? 2 : 10,
        previousStock: 0,
        newStock: 0,
        referenceId: order.id,
        cost: index === 0 ? 30000 : 1000,
      })),
    });
    const later = await db.restockOrder.create({
      data: { storeId, supplierId, orderNumber: "PO-9999", status: "COMPLETED", totalAmount: 2000, shippingCost: 0, createdAt: new Date(Date.now() + 60_000) },
    });
    laterOrderId = later.id;
    await db.inventoryMovement.createMany({
      data: [
        { storeId, productId: LATER_PRODUCT, type: "RESTOCK_RECEIVED", quantity: 5, previousStock: 0, newStock: 0, referenceId: order.id, cost: 2000, createdAt: new Date(Date.now() - 60_000) },
        { storeId, productId: LATER_PRODUCT, type: "RESTOCK_RECEIVED", quantity: 1, previousStock: 0, newStock: 0, referenceId: later.id, cost: 2000, createdAt: new Date(Date.now() + 60_000) },
      ],
    });
  });

  test.afterEach(async () => {
    await db.inventoryMovement.deleteMany({ where: { referenceId: { in: [orderId, laterOrderId] } } });
    await db.restockOrderItem.deleteMany({ where: { restockOrderId: orderId } });
    await db.restockOrder.deleteMany({ where: { id: { in: [orderId, laterOrderId] } } });
  });

  test.afterAll(async () => {
    for (const product of originals) await db.product.update({ where: { id: product.id }, data: { transportationCost: product.transportationCost } });
    await db.supplier.deleteMany({ where: { id: supplierId } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
  ]) {
    test(`vista previa por producto y confirmación a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Corregir envío de un pedido de aprovisionamiento",
        redirectUrl: new URL(`/${storeId}/aprovisionamiento/${orderId}`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/${storeId}/aprovisionamiento/${orderId}`));

      const open = page.getByRole("button", { name: "Corregir envío" });
      await expect(async () => {
        await open.click();
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Corregir el envío del pedido");
      await dialog.getByLabel("Envío real del pedido").fill("11000");
      await dialog.getByRole("button", { name: "Ver cambios" }).click();

      const cards = dialog.getByRole("list", { name: "Cambios por producto" }).getByRole("listitem");
      await expect(cards).toHaveCount(2);
      await expect(cards.filter({ hasText: "Producto feria E2E" })).toContainText(/sin registrar.*\$\s3\.000/);
      await expect(cards.filter({ hasText: "Libreta reservas E2E" })).toContainText(/sin registrar.*\$\s100/);
      await expect(dialog.getByRole("heading", { name: "No se cambian (1)" })).toBeVisible();
      const skipped = dialog.getByRole("list", { name: "Productos que no se cambian" }).getByRole("listitem");
      await expect(skipped).toHaveCount(1);
      await expect(skipped).toContainText("Producto archivado E2E");
      await expect(skipped).toContainText("No se cambia: su costo actual viene de un pedido más reciente (PO-9999).");
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-vista-previa.png`), fullPage: false });

      const confirm = dialog.getByRole("button", { name: "Confirmar en 2 productos" });
      await confirm.scrollIntoViewIfNeeded();
      expect(await uncovered(confirm)).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-confirmar.png`), fullPage: false });
      await confirm.click();
      await expect(page.getByText(/^Envío del pedido PO-E2E-\d+ corregido en 2 productos\.$/).first()).toBeVisible({ timeout: 30_000 });
      await expect(dialog).toBeHidden();

      const after = await db.product.findMany({ where: { id: { in: ALL } }, select: { id: true, transportationCost: true } });
      expect(Object.fromEntries(after.map((row) => [row.id, row.transportationCost]))).toEqual({ [PRODUCTS[0]]: 3000, [PRODUCTS[1]]: 100, [LATER_PRODUCT]: null });
      expect((await db.restockOrder.findUniqueOrThrow({ where: { id: orderId } })).shippingCost).toBe(11000);
      expect(await db.inventoryMovement.count({ where: { referenceId: orderId, type: "MANUAL_ADJUSTMENT", quantity: 0 } })).toBe(2);
      await expect(page.getByText(/^\$\s11\.000$/).first()).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-despues.png`), fullPage: false });
    });
  }
});
