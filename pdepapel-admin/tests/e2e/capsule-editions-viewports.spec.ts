import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Ediciones de cápsulas de punta a punta en 390, 768 y 1280: en el taller se
 * elige la categoría, se ponen 20 papeles de un producto, se guardan los
 * packs (pasa la revisión de margen) y se imprimen (se abre la hoja de
 * etiquetas con sus QR). Después, en «Sacar cápsulas», un pedido pagado de
 * pack de 5 —sembrado aquí: el checkout de cápsulas es P4— se saca
 * escribiendo cada código en el campo, se cierra con su costo real y su caja
 * sugerida. Nada se desborda a lo ancho. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/capsule-editions-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/capsulas-shots");
const CATEGORY_ID = "00000000-0000-4000-8000-000000000002";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const created = { products: [] as string[], editions: [] as string[], orders: [] as string[] };

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de ediciones de cápsulas",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

async function seedEdition(width: number) {
  const seed = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { sizeId: true, colorId: true, designId: true } });
  const base = { storeId, categoryId: CATEGORY_ID, sizeId: seed.sizeId, colorId: seed.colorId, designId: seed.designId, description: "Producto de pruebas de cápsulas" };
  const slipProduct = await db.product.create({
    data: { ...base, id: `e2e-capsule-slip-${width}`, name: `Lapicero cápsula ${width}`, slug: `lapicero-capsula-${width}`, sku: `E2E-CAP-SLIP-${width}`, stock: 25, price: 9000, acqPrice: 4000 },
  });
  const extraProduct = await db.product.create({
    data: { ...base, id: `e2e-capsule-extra-${width}`, name: `Borrador cápsula ${width}`, slug: `borrador-capsula-${width}`, sku: `E2E-CAP-EXTRA-${width}`, stock: 5, price: 9000, acqPrice: 4000 },
  });
  const editionProduct = await db.product.create({
    data: { ...base, id: `e2e-capsule-edition-${width}`, name: `Cápsula edición ${width}`, slug: `capsula-edicion-${width}`, sku: `E2E-CAP-ED-${width}`, stock: 0, price: 12900, acqPrice: 0, isArchived: true },
  });
  const edition = await db.capsuleEdition.create({
    data: { storeId, number: width, name: `Escritorio ${width}`, theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 },
  });
  created.products.push(slipProduct.id, extraProduct.id, editionProduct.id);
  created.editions.push(edition.id);
  return { slipProduct, extraProduct, edition };
}

test.describe("ediciones de cápsulas en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("capsule-editions-viewports");
    await db.store.update({ where: { id: storeId }, data: { storeMinMarginPercent: 35 } });
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.capsuleSlip.deleteMany({ where: { editionId: { in: created.editions } } });
    await db.capsuleOrder.deleteMany({ where: { editionId: { in: created.editions } } });
    await db.capsulePackOption.deleteMany({ where: { editionId: { in: created.editions } } });
    await db.capsuleBatchItem.deleteMany({ where: { batch: { editionId: { in: created.editions } } } });
    await db.capsuleBatch.deleteMany({ where: { editionId: { in: created.editions } } });
    await db.capsuleEdition.deleteMany({ where: { id: { in: created.editions } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: created.orders } } });
    await db.order.deleteMany({ where: { id: { in: created.orders } } });
    await db.productPriceTier.deleteMany({ where: { productId: { in: created.products } } });
    await db.inventoryMovement.deleteMany({ where: { productId: { in: created.products } } });
    await db.marketplaceOutboxEvent.deleteMany({ where: { productId: { in: created.products } } });
    await db.product.deleteMany({ where: { id: { in: created.products } } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`armar, imprimir y sacar en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const { slipProduct, extraProduct, edition } = await seedEdition(viewport.width);
      const category = await db.category.findUniqueOrThrow({ where: { id: CATEGORY_ID }, select: { name: true } });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/productos/ediciones/${edition.id}`);

      // Bolsa: la categoría, buscar y 20 papeles del lapicero.
      await expect(page.getByRole("heading", { name: `#${viewport.width} · Escritorio ${viewport.width}` })).toBeVisible({ timeout: 90_000 });
      await page.getByRole("checkbox", { name: category.name }).check();
      await page.getByRole("button", { name: "Buscar productos" }).click();
      const quantity = page.getByRole("textbox", { name: `Papeles de ${slipProduct.name}` });
      await expect(quantity).toBeVisible({ timeout: 30_000 });
      await quantity.fill("20");
      await page.getByRole("textbox", { name: `Papeles de ${extraProduct.name}` }).fill("2");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-bolsa.png`), fullPage: true });

      // Packs: sin regalo ni caja, pasan la revisión con el margen mínimo de la tienda.
      await page.getByRole("button", { name: "Guardar packs" }).click();
      await expect(page.getByText("Packs guardados").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("margen-pack-5")).toContainText("P95");
      await expect(page.getByTestId("margen-pack-30")).toContainText("No disponible con esta bolsa");
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-packs.png`), fullPage: true });

      // Imprimir: aparta y abre la hoja de etiquetas con un QR por papel.
      const print = page.getByRole("button", { name: "Imprimir 22 papeles" });
      await expect(print).toBeEnabled({ timeout: 30_000 });
      const popup = page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null);
      await print.click();
      const sheet = (await popup) ?? page;
      await sheet.waitForURL(/etiquetas\/imprimir/, { timeout: 60_000 });
      await expect(sheet.locator("svg").first()).toBeVisible({ timeout: 60_000 });
      await sheet.screenshot({ path: path.join(SHOTS, `${viewport.name}-3-etiquetas.png`) });
      await expect.poll(async () => (await db.product.findUniqueOrThrow({ where: { id: slipProduct.id } })).reservedUnits).toBe(20);

      // Anular un producto con una bolsa a medio armar: la bolsa no se pierde.
      await page.goto(new URL(`/${storeId}/productos/ediciones/${edition.id}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("checkbox", { name: category.name }).check();
      await page.getByRole("button", { name: "Buscar productos" }).click();
      const inProgress = page.getByRole("textbox", { name: `Papeles de ${slipProduct.name}` });
      await inProgress.fill("1");
      await page.getByRole("listitem").filter({ hasText: `${extraProduct.name} (papel)` }).getByRole("button", { name: "Anular 2" }).click();
      await expect(page.getByText("2 anulados").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("listitem").filter({ hasText: `${extraProduct.name} (papel)` })).toContainText("0 impresos · 0 sacados · 2 anulados");
      await expect(inProgress).toHaveValue("1");
      await expect.poll(async () => (await db.product.findUniqueOrThrow({ where: { id: extraProduct.id } })).reservedUnits).toBe(0);

      // Un pedido pagado de pack de 5, con el costo provisional ya en sus finanzas.
      const order = await db.order.create({
        data: {
          storeId,
          orderNumber: `E2E-CAP-${viewport.width}-${Date.now()}`,
          status: "PAID",
          paidAt: new Date(),
          fullName: `Clienta ${viewport.width}`,
          subtotal: 64500,
          total: 64500,
          totalProductCost: 20000,
          gatewayFee: 3366,
          shippingCost: 0,
          netProfit: 64500 - 20000 - 3366,
          payment: { create: { method: "Bold", storeId } },
        },
      });
      created.orders.push(order.id);
      await db.capsuleOrder.create({ data: { storeId, orderId: order.id, editionId: edition.id, packSize: 5, provisionalCost: 20000, videoConsent: "PUBLIC_FIRST_NAME" } });
      const codes = (await db.capsuleSlip.findMany({ where: { editionId: edition.id, productId: slipProduct.id, status: "PRINTED" }, orderBy: { code: "asc" }, take: 5 })).map((slip) => slip.code);

      // Sacar: escribir cada código en el campo, cerrar y ver la caja.
      await page.goto(new URL(`/${storeId}/productos/ediciones/sacar`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: new RegExp(`Clienta · pack de 5`) }).filter({ hasText: order.orderNumber }).click();
      const codeField = page.getByRole("textbox", { name: "Código del papel" });
      await expect(codeField).toBeVisible({ timeout: 30_000 });
      for (let index = 0; index < codes.length; index += 1) {
        await codeField.fill(codes[index]);
        await codeField.press("Enter");
        await expect(page.getByText(`${index + 1} de 5`, { exact: true })).toBeVisible({ timeout: 30_000 });
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-4-sacar.png`), fullPage: true });
      await page.getByRole("button", { name: "Cerrar sorteo" }).click();
      await expect(page.getByText(/Sorteo cerrado · costo real/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Marcar «Grabado»" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-5-cerrado.png`), fullPage: true });
      await expect(db.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ costStatus: "REAL", realCost: 20000 });

      // Video: un paso adelante y el pedido pasa a la pestaña de videos.
      await page.getByRole("button", { name: "Marcar «Grabado»" }).click();
      await expect(page.getByRole("button", { name: "Marcar «Enviado»" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab", { name: /Videos \(\d+\)/ })).toBeVisible();
      await expect.poll(async () => (await db.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } })).videoStatus).toBe("GRABADO");
    });
  }
});
