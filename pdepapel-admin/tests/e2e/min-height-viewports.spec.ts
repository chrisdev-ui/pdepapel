import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * `theme.extend.minHeight` era un texto y no una función: ninguna clase
 * `min-h-<n>` existía, y los botones de 44 px del panel medían lo que les
 * tocara. Con el arreglo, en 390 px cada elemento con `min-h-11` mide 44 o
 * más, nada se sale de lado, y Configuración trae las cinco plantillas.
 *
 *   npm run test:e2e:prod -- tests/e2e/min-height-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/min-h-shots");

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let brandId = "";
let productId = "";

async function signIn(page: Page, to: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de alturas mínimas",
    redirectUrl: new URL(to, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

/** Alto de cada elemento visible con `min-h-11`, fuera de los que la pantalla ancha apaga. */
const minH11Heights = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[class~='min-h-11']"))
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).minHeight === "44px")
      .map((el) => Math.round(el.getBoundingClientRect().height)),
  );

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("alturas mínimas en 390 px", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("min-height-viewports");
    const brand = await db.brand.upsert({
      where: { storeId_slug: { storeId, slug: "marca-e2e-alturas" } },
      create: { storeId, name: "Marca e2e alturas", slug: "marca-e2e-alturas", aliases: [] },
      update: {},
    });
    brandId = brand.id;
    // Un producto sin marca que la nombra: «Sugerencias» lista una fila y se mide.
    const base = await db.product.findFirst({
      where: { storeId, isArchived: false },
      select: { categoryId: true, colorId: true, sizeId: true, designId: true },
    });
    if (base) {
      const product = await db.product.create({
        data: {
          storeId,
          ...base,
          name: "Cuaderno Marca e2e alturas",
          slug: `cuaderno-marca-e2e-alturas-${Date.now()}`,
          sku: `E2E-ALTURAS-${Date.now()}`,
          price: 5000,
          stock: 3,
          description: "<p>Prueba de alturas.</p>",
        },
      });
      productId = product.id;
    }
  });
  test.afterAll(async () => {
    if (!db) return;
    if (productId) await db.product.deleteMany({ where: { id: productId } });
    await db.brand.deleteMany({ where: { storeId, slug: "marca-e2e-alturas" } });
    await db.$disconnect();
  });

  test("la clase min-h-11 vuelve a existir", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/marcas/sugerencias`);
    await expect(page.locator("main")).toBeVisible({ timeout: 90_000 });
    const minHeight = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "min-h-11";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).minHeight;
      probe.remove();
      return value;
    });
    expect(minHeight).toBe("44px");
  });

  for (const route of [
    { name: "marcas-sugerencias", path: "marcas/sugerencias" },
    { name: "marca-logo", path: "marcas/__BRAND__" },
    { name: "marcas", path: "marcas" },
    { name: "pedidos", path: "pedidos" },
    { name: "productos", path: "productos" },
    { name: "conversaciones", path: "conversaciones" },
    { name: "reservas", path: "reservas" },
    { name: "negocio", path: "negocio" },
  ]) {
    test(`${route.name}: los toques de 44 px miden 44 y nada se sale de lado`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, `/${storeId}/${route.path.replace("__BRAND__", brandId)}`);
      await expect(page.locator("main")).toBeVisible({ timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
      if (route.name === "marcas-sugerencias") {
        await expect(page.getByText("Cuaderno Marca e2e alturas").first()).toBeVisible({ timeout: 60_000 });
      }
      const heights = await minH11Heights(page);
      console.log(`[min-h] ${route.name}: ${heights.length} con min-h-11 · menor ${heights.length ? Math.min(...heights) : "—"} px`);
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `390-${route.name}.png`), fullPage: true });
    });
  }

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "1280", width: 1280, height: 800 },
  ]) {
    test(`Configuración en ${viewport.name}: las cinco plantillas de avisos`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/configuracion`);
      const heading = page.getByText("Avisos de envío por WhatsApp").filter({ visible: true }).first();
      await expect(heading).toBeVisible({ timeout: 90_000 });
      for (const label of ["ya tiene guía", "en tránsito", "en reparto", "entregado", "novedad"]) {
        await expect(page.getByText(`Plantilla «${label}»`).filter({ visible: true }).first()).toBeVisible();
      }
      await expect(async () => {
        await heading.scrollIntoViewIfNeeded({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-configuracion-avisos.png`), fullPage: false });
    });
  }
});
