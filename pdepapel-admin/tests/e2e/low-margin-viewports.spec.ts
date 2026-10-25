import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Browser, Page } from "@playwright/test";

import { expect, stubCloudinaryImages, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Margen bajo» (Productos, solo la dueña) a 390 y 1280 px: una oferta que
 * vende bajo el costo abre la vista, cada sección cuenta lo suyo, «solo por
 * Bold» va plegado con el porqué y la vista no escribe nada.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/low-margin-viewports.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/low-margin-shots");
const OFFER_NAME = "Oferta E2E margen";

const PRODUCTS = [
  { id: "e2e-margin-offer-product", name: "Cartuchera oferta E2E", price: 8_000 },
  { id: "e2e-margin-below-cost", name: "Lapicero bajo costo E2E", price: 5_000 },
  { id: "e2e-margin-below-minimum", name: "Agenda bajo mínimo E2E", price: 9_000 },
  { id: "e2e-margin-bold-only", name: "Sticker solo Bold E2E", price: 10_000 },
] as const;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Margen bajo",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

/**
 * La oferta se crea y se borra con la API del panel, como desde el formulario:
 * la API invalida `store:<id>:active-offers`. Escrita directo en la base, un
 * spec anterior de la misma corrida ya dejó la lista vacía en el Redis falso
 * (1 h) y «Margen bajo» no la veía.
 */
async function withOwnerPage<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage();
  try {
    await stubCloudinaryImages(page);
    const target = `/${storeId}/ofertas`;
    await signIn(page, target);
    await page.waitForURL((url) => url.pathname === target, { timeout: 120_000 });
    return await run(page);
  } finally {
    await page.close();
  }
}

const offersApi = (suffix = "") => new URL(`/api/${storeId}/offers${suffix}`, baseURL).toString();

async function deleteLeftoverOffers(page: Page) {
  const listed = await page.request.get(offersApi());
  expect(listed.ok(), await listed.text()).toBe(true);
  const ids = ((await listed.json()) as { id: string; name: string }[]).filter((offer) => offer.name === OFFER_NAME).map((offer) => offer.id);
  if (ids.length === 0) return;
  const deleted = await page.request.delete(offersApi(), { data: { ids } });
  expect(deleted.ok(), await deleted.text()).toBe(true);
}

test.describe("margen bajo", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");
  let previousMinimum: number | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const db = createTestPrismaClient("low-margin-viewports");
    const template = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { categoryId: true, sizeId: true, colorId: true, designId: true } });
    previousMinimum = (await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { storeMinMarginPercent: true } })).storeMinMarginPercent;
    await db.store.update({ where: { id: storeId }, data: { storeMinMarginPercent: 40 } });
    for (const product of PRODUCTS) {
      const data = { ...template, storeId, name: product.name, description: "Producto para «Margen bajo» E2E.", slug: product.id, sku: product.id.toUpperCase(), stock: 5, price: product.price, acqPrice: 6_000, isArchived: false };
      await db.product.upsert({ where: { id: product.id }, update: data, create: { id: product.id, ...data } });
    }
    await db.$disconnect();

    await withOwnerPage(browser, async (page) => {
      await deleteLeftoverOffers(page);
      // Lo mismo que envía el formulario de Ofertas; la API pasa las fechas a días de Colombia.
      const created = await page.request.post(offersApi(), {
        data: {
          name: OFFER_NAME,
          label: "Feria E2E",
          type: "FIXED",
          amount: 3_000,
          isActive: true,
          startDate: new Date(Date.now() - 86_400_000).toISOString(),
          endDate: new Date(Date.now() + 86_400_000).toISOString(),
          productIds: [PRODUCTS[0].id],
          categoryIds: [],
          productGroupIds: [],
        },
      });
      expect(created.ok(), await created.text()).toBe(true);
    });
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    try {
      await withOwnerPage(browser, deleteLeftoverOffers);
    } catch (error) {
      // Sin sesión no hay API: se borra en la base y la próxima corrida vuelve a limpiar por la API.
      console.warn("[low-margin-viewports] la oferta se borra en la base; la caché de ofertas activas puede quedar vieja:", error);
      const db = createTestPrismaClient("low-margin-viewports");
      await db.offer.deleteMany({ where: { storeId, name: OFFER_NAME } });
      await db.$disconnect();
    }
    const db = createTestPrismaClient("low-margin-viewports");
    await db.product.updateMany({ where: { id: { in: PRODUCTS.map((product) => product.id) } }, data: { isArchived: true } });
    await db.store.update({ where: { id: storeId }, data: { storeMinMarginPercent: previousMinimum } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "escritorio-1280", width: 1280, height: 900 },
  ]) {
    test(`secciones, oferta bajo costo y «solo por Bold» plegado a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const writes: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) writes.push(`${request.method()} ${request.url()}`);
      });

      await signIn(page, `/${storeId}/productos/margen-bajo`);
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/margen-bajo`));
      await expect(page.getByRole("heading", { level: 1, name: "Margen bajo" })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Esto es solo una guía: ningún precio se cambia solo.")).toBeVisible();

      const sections = page.getByRole("navigation", { name: "Secciones de margen bajo" });
      await expect(sections.getByRole("link", { name: "Ofertas que venden bajo el costo (1)", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(sections.getByRole("link", { name: "Bajo el costo (1)", exact: true })).toBeVisible();
      await expect(sections.getByRole("link", { name: "Bajo 40 % antes de Bold (1)", exact: true })).toBeVisible();

      // La oferta abre la vista: precio con oferta, el normal tachado y su etiqueta.
      const offerRow = viewport.width < 1024 ? page.getByRole("listitem").filter({ hasText: "Cartuchera oferta E2E" }) : page.getByRole("row").filter({ hasText: "Cartuchera oferta E2E" });
      await expect(offerRow).toBeVisible();
      await expect(offerRow).toContainText("$5.000");
      await expect(offerRow).toContainText("Feria E2E");
      await expect(offerRow).toContainText("$6.000");
      await expect(offerRow.getByRole("link", { name: "Cartuchera oferta E2E" })).toHaveAttribute("href", `/${storeId}/productos/e2e-margin-offer-product`);

      // «Solo por Bold» plegado, con el fijo de $1.071 explicado; abrirlo lleva a su lista.
      const folded = page.locator("details").filter({ hasText: "Bajo 40 % solo por Bold (1)" });
      await expect(folded).not.toHaveAttribute("open", "");
      await folded.locator("summary").click();
      await expect(folded).toContainText("$1.071");
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-oferta.png`), fullPage: true });
      await folded.getByRole("link", { name: "Ver la lista (1)" }).click();
      await expect(page).toHaveURL(/seccion=solo-bold/);
      await expect(page.getByRole("heading", { level: 2, name: "Bajo 40 % solo por Bold (1)" })).toBeVisible();
      await expect(page.getByText("Sticker solo Bold E2E").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("Para 40 % con Bold (1 unidad)").filter({ visible: true }).first()).toBeVisible();

      await sections.getByRole("link", { name: "Bajo 40 % antes de Bold (1)", exact: true }).click();
      await expect(page).toHaveURL(/seccion=bajo-minimo/);
      await expect(page.getByText("Agenda bajo mínimo E2E").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("$10.900").filter({ visible: true }).first()).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-bajo-minimo.png`), fullPage: true });
      expect(writes).toEqual([]);
    });
  }
});
