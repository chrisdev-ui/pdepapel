import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import { PresaleDepositType, PresalePaymentMode, ProductPresaleStatus, type PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Banner de preventa de la portada creado desde el panel, en 390 y 1280, tal
 * como lo hará Paula: Banner de campaña › Preventa (el botón pasa solo a
 * «Separar el mío» sin enlace), el producto con el buscador, sin imagen, con
 * el identificador de GA4, y «Crear». Queda «En vivo» en Contenido, al
 * abrirlo de nuevo el buscador muestra el producto y la API pública devuelve
 * el anticipo y el abono mínimo de su preventa con el botón hacia la ficha.
 *
 *   npm run test:e2e:prod -- tests/e2e/home-content-presale-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/portada-preventa-shots");
const TEMPLATE = "e2e-fair-product";
const PRICE = 160000;
const DEPOSIT = 30000;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 900 },
];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const products: string[] = [];
const created: string[] = [];

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Banner de preventa en la portada",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("banner de preventa desde Contenido › Portada", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("home-content-presale-viewports");
    const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
    for (const viewport of VIEWPORTS) {
      const suffix = randomUUID().slice(0, 6);
      const product = await db.product.create({
        data: {
          storeId,
          name: `Calendario preventa portada ${viewport.name}`,
          slug: `calendario-preventa-portada-${viewport.name}-${suffix}`,
          description: "Calendario de prueba.",
          stock: 0,
          price: PRICE,
          acqPrice: 123778,
          sku: `CAL-PORT-${viewport.name}-${suffix}`,
          categoryId: template.categoryId,
          sizeId: template.sizeId,
          colorId: template.colorId,
          designId: template.designId,
        },
      });
      products.push(product.id);
      await db.productPresale.create({
        data: {
          storeId,
          productId: product.id,
          status: ProductPresaleStatus.ACTIVE,
          unitLimit: null,
          expectedArrivalAt: null,
          paymentMode: PresalePaymentMode.DEPOSIT,
          depositType: PresaleDepositType.FIXED,
          depositValue: DEPOSIT,
          createdBy: "e2e",
        },
      });
    }
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.homeContentProduct.deleteMany({ where: { homeContentId: { in: created } } });
    await db.homeContent.deleteMany({ where: { id: { in: created } } });
    await db.productPresale.deleteMany({ where: { productId: { in: products } } });
    await db.product.deleteMany({ where: { id: { in: products } } });
    await db.$disconnect();
  });

  VIEWPORTS.forEach((viewport, index) => {
    test(`en ${viewport.name}: Preventa, producto, sin imagen, Crear → En vivo con anticipo y abono`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const productName = `Calendario preventa portada ${viewport.name}`;
      const title = `Calendario de Adviento ${viewport.name} ${randomUUID().slice(0, 4)}`;
      const promotionId = `kiut-adviento-e2e-${viewport.name}`;

      await signIn(page, `/${storeId}/portada/nuevo`);
      await expect(page.getByRole("combobox", { name: "Ubicación" })).toBeVisible({ timeout: 60_000 });

      await page.getByRole("combobox", { name: "Ubicación" }).click();
      await page.getByRole("option", { name: "Banner de campaña" }).click();
      await page.getByRole("combobox", { name: "Tipo de campaña" }).click();
      await page.getByRole("option", { name: "Preventa" }).click();

      await expect(page.getByLabel("Botón principal", { exact: true })).toHaveValue("Separar el mío");
      await expect(page.getByLabel("Enlace del botón principal", { exact: true })).toHaveValue("");

      await page.getByLabel("Etiqueta corta", { exact: true }).fill("Preventa · llega en diciembre");
      await page.getByRole("textbox", { name: /^Título/ }).fill(title);

      await page.getByRole("combobox", { name: "Producto en preventa" }).click();
      await page.getByPlaceholder("Buscar por nombre, SKU o código...").fill(productName);
      await page.getByRole("option", { name: new RegExp(productName) }).first().click();
      await expect(page.getByRole("combobox", { name: "Producto en preventa" })).toContainText(productName);

      await expect(page.getByText("Imagen para el teléfono")).toBeVisible();
      await page.getByLabel("Identificador para Google Analytics", { exact: true }).fill(promotionId);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-formulario.png`), fullPage: true });

      await page.getByRole("button", { name: "Crear" }).click();
      await page.waitForURL(new RegExp(`/${storeId}/contenido`), { timeout: 60_000 });
      await expect(page.getByText("Contenido creado").first()).toBeVisible({ timeout: 30_000 });

      const row = await db.homeContent.findFirstOrThrow({
        where: { storeId, title },
        select: { id: true, campaignType: true, primaryLabel: true, primaryUrl: true, imageUrl: true, promotionId: true, products: { select: { productId: true } } },
      });
      created.push(row.id);
      expect(row).toMatchObject({ campaignType: "PRESALE", primaryLabel: "Separar el mío", imageUrl: null, promotionId, products: [{ productId: products[index] }] });
      expect(row.primaryUrl ?? "").toBe("");

      const listed = page.getByText(title).first();
      await expect(listed).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("En vivo").first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-contenido.png`), fullPage: true });

      await page.goto(new URL(`/${storeId}/portada/${row.id}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("combobox", { name: "Producto en preventa" })).toContainText(productName, { timeout: 60_000 });
      await expect(page.getByLabel("Identificador para Google Analytics", { exact: true })).toHaveValue(promotionId);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-3-editar.png`), fullPage: true });

      const live = await page.request.get(new URL(`/api/${storeId}/home-content?live=1`, baseURL).toString());
      expect(live.ok()).toBe(true);
      const { campaign } = (await live.json()) as { campaign: { id: string; primaryLabel: string; primaryUrl: string; promotionId: string; presale: { depositPerUnit: number; minInstallment: number | null; price: number } | null } | null };
      expect(campaign?.id).toBe(row.id);
      expect(campaign).toMatchObject({
        primaryLabel: "Separar el mío",
        promotionId,
        presale: { price: PRICE, depositPerUnit: DEPOSIT, minInstallment: 10000 },
      });
      expect(campaign?.primaryUrl).toMatch(/^\/producto\/calendario-preventa-portada-/);
      // Una sola campaña en vivo: la del siguiente tamaño no compite con esta.
      await db.homeContent.update({ where: { id: row.id }, data: { isActive: false } });
    });
  });
});
