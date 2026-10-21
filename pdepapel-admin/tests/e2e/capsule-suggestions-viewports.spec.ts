import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Ediciones sugeridas en 390, 768 y 1280: con productos quietos de un diseño
 * sale una edición sugerida (con su margen por pack); el producto de
 * personaje queda en «Revisar licencia»; «Usar esta sugerencia» llena
 * «Nueva edición», Paula elige el producto y crea; el taller llega con la
 * bolsa sugerida y sus razones, y «Revisar margen» la mide. Nada se imprime.
 * Nada se desborda a lo ancho. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/capsule-suggestions-viewports.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/capsulas-sugeridas-shots");
const CATEGORY_ID = "00000000-0000-4000-8000-000000000002";
const DESIGN = "E2E Sugerida Kawaii";
const SUGGESTION = `Edición ${DESIGN}`;
const PACKS = [5, 10, 15, 20, 25, 30];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const created = { products: [] as string[], designs: [] as string[] };
let previousMargin: number | null = null;

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de ediciones sugeridas",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("ediciones sugeridas en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("capsule-suggestions-viewports");
    previousMargin = (await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { storeMinMarginPercent: true } })).storeMinMarginPercent;
    // El piso de cápsulas (50 %) manda sobre el margen mínimo de la tienda (35 %).
    await db.store.update({ where: { id: storeId }, data: { storeMinMarginPercent: 35, capsuleMinSlipCost: 3000, capsuleMinMarginPct: 50 } });
    for (const packSize of PACKS) {
      await db.capsulePackTemplate.upsert({
        where: { storeId_packSize: { storeId, packSize } },
        update: { giftMaxCost: packSize >= 10 ? 2000 : 0, giftMaxItems: packSize >= 10 ? 1 : 0, boxReserveCost: 1500 },
        create: { storeId, packSize, giftMaxCost: packSize >= 10 ? 2000 : 0, giftMaxItems: packSize >= 10 ? 1 : 0, boxReserveCost: 1500 },
      });
    }
    const seed = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { sizeId: true, colorId: true, designId: true } });
    const design = await db.design.create({ data: { name: DESIGN, storeId } });
    created.designs.push(design.id);
    const idleSince = new Date(Date.now() - 200 * 86_400_000);
    const base = { storeId, categoryId: CATEGORY_ID, sizeId: seed.sizeId, colorId: seed.colorId, description: "Producto quieto de pruebas", price: 12000, createdAt: idleSince };
    for (let i = 0; i < 12; i += 1) {
      const row = await db.product.create({
        data: { ...base, designId: design.id, name: `Libreta sugerida ${i + 1}`, slug: `e2e-libreta-sugerida-${i + 1}`, sku: `E2E-SUG-${i + 1}`, stock: 6, acqPrice: 3200 + i * 150 },
      });
      created.products.push(row.id);
    }
    const licensed = await db.product.create({
      data: { ...base, designId: design.id, name: "Cuaderno Hello Kitty sugerido", slug: "e2e-cuaderno-hello-kitty", sku: "E2E-SUG-HK", stock: 6, acqPrice: 4000 },
    });
    created.products.push(licensed.id);
    // Relleno de otro diseño: así el diseño de prueba no pasa del 40 % de los quietos.
    for (let i = 0; i < 22; i += 1) {
      const row = await db.product.create({
        data: { ...base, designId: seed.designId, name: `Relleno sugerido ${i + 1}`, slug: `e2e-relleno-sugerido-${i + 1}`, sku: `E2E-SUG-R-${i + 1}`, stock: 2, acqPrice: 9000 + i },
      });
      created.products.push(row.id);
    }
  });

  test.afterAll(async () => {
    if (!db) return;
    const editions = await db.capsuleEdition.findMany({ where: { product: { id: { in: created.products } } }, select: { id: true } });
    await db.capsuleEdition.deleteMany({ where: { id: { in: editions.map((edition) => edition.id) } } });
    await db.capsuleSuggestionFeedback.deleteMany({ where: { storeId } });
    await db.capsulePackTemplate.deleteMany({ where: { storeId } });
    await db.inventoryMovement.deleteMany({ where: { productId: { in: created.products } } });
    await db.productPriceTier.deleteMany({ where: { productId: { in: created.products } } });
    await db.product.deleteMany({ where: { id: { in: created.products } } });
    await db.design.deleteMany({ where: { id: { in: created.designs } } });
    await db.store.update({ where: { id: storeId }, data: { storeMinMarginPercent: previousMargin, capsuleMinMarginPct: null } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`sugerir, usar y llegar al taller con la bolsa en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const seed = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { sizeId: true, colorId: true, designId: true } });
      const editionProduct = await db.product.create({
        data: {
          storeId,
          categoryId: CATEGORY_ID,
          sizeId: seed.sizeId,
          colorId: seed.colorId,
          designId: seed.designId,
          description: "Producto de la edición",
          name: `Cápsula sugerida ${viewport.width}`,
          slug: `e2e-capsula-sugerida-${viewport.width}`,
          sku: `E2E-SUG-ED-${viewport.width}`,
          stock: 0,
          price: 12900,
          acqPrice: 0,
        },
      });
      created.products.push(editionProduct.id);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/productos/ediciones`);

      const card = page.getByTestId("edicion-sugerida").filter({ hasText: SUGGESTION });
      await expect(card).toBeVisible({ timeout: 90_000 });
      await expect(card).toContainText("12 productos");
      await expect(card).toContainText("Pack 5: P95");
      await expect(card.getByTestId("piso-usado")).toContainText("Piso usado: 50 %");
      await expect(page.getByText("Cuaderno Hello Kitty sugerido")).toBeVisible();
      await expect(page.getByRole("switch", { name: /Permitir en cápsulas/ }).first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-sugeridas.png`), fullPage: true });

      await card.getByText(/Ver la bolsa/).click();
      await expect(card.getByText(/días sin venta|Sin ventas en el último año/).first()).toBeVisible();
      await card.getByRole("button", { name: "Usar esta sugerencia" }).click();
      await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(SUGGESTION);
      await expect(page.getByLabel("Margen mínimo de la edición (%)")).toHaveValue("50");
      await expect(page.getByRole("status").filter({ hasText: SUGGESTION })).toBeVisible();

      await page.getByRole("combobox", { name: "Producto de la edición" }).click();
      await page.getByPlaceholder("Buscar por nombre, SKU o código...").fill(`Cápsula sugerida ${viewport.width}`);
      await page.getByRole("option", { name: new RegExp(`Cápsula sugerida ${viewport.width}`) }).first().click();
      await page.getByRole("button", { name: "Crear edición" }).click();

      await page.waitForURL(/\/productos\/ediciones\/[^/?]+\?tema=/, { timeout: 60_000 });
      const firstQuantity = page.getByRole("textbox", { name: /^Papeles de Libreta sugerida/ }).first();
      await expect(firstQuantity).toBeVisible({ timeout: 60_000 });
      await expect(firstQuantity).not.toHaveValue("");
      await expect(page.getByText(/cabe en la banda/).first()).toBeVisible();
      await expect(page.getByTestId("piso-bolsa")).toContainText("Piso usado: 50 % (de esta edición)");
      await expect(page.getByRole("textbox", { name: "Papeles de Cuaderno Hello Kitty sugerido" })).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-taller.png`), fullPage: true });

      await page.getByRole("button", { name: "Revisar margen" }).click();
      await expect(page.getByTestId("margen-pack-5")).toContainText("P95", { timeout: 30_000 });
      const edition = await db.capsuleEdition.findFirstOrThrow({ where: { productId: editionProduct.id }, select: { id: true, status: true, minMarginPct: true } });
      expect(edition.status).toBe("DRAFT");
      expect(edition.minMarginPct).toBe(50);
      expect(await db.capsuleSlip.count({ where: { editionId: edition.id } })).toBe(0);
    });
  }
});
