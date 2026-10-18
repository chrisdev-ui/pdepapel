import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Regresión 2026-10-17: con un aumento de categoría de más de 100 %, la
 * calculadora plegada («Calculadora de precio (no se guarda)») quedaba con un
 * valor por encima de su máximo y el navegador frenaba el envío del formulario
 * sin decir nada: «Guardar cambios» no hacía nada. A 390 y 1280 px, la ficha
 * debe guardar. Deja el nombre, el aumento de la categoría y las fotos como estaban.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/product-save-markup.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const PRODUCT = "e2e-fair-product";
const MARKUP = 150;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Guardar la ficha con aumento alto",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("ficha con aumento de categoría de más de 100 %", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  let original: { name: string; categoryId: string; markup: number | null };
  let addedImageId: string | null = null;

  test.beforeAll(async () => {
    const db = createTestPrismaClient("product-save-markup");
    try {
      const product = await db.product.findUniqueOrThrow({ where: { id: PRODUCT }, select: { name: true, categoryId: true } });
      const category = await db.category.findUniqueOrThrow({ where: { id: product.categoryId }, select: { markupOverridePercent: true } });
      original = { name: product.name, categoryId: product.categoryId, markup: category.markupOverridePercent };
      await db.category.update({ where: { id: product.categoryId }, data: { markupOverridePercent: MARKUP } });
      // La ficha exige una foto principal; sin ella no guardaría por otra razón.
      const main = await db.image.findFirst({ where: { productId: PRODUCT, isMain: true }, select: { id: true } });
      if (!main) {
        const image = await db.image.create({ data: { productId: PRODUCT, url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", isMain: true } });
        addedImageId = image.id;
      }
    } finally {
      await db.$disconnect();
    }
  });

  test.afterAll(async () => {
    const db = createTestPrismaClient("product-save-markup");
    try {
      await db.product.update({ where: { id: PRODUCT }, data: { name: original.name } });
      await db.category.update({ where: { id: original.categoryId }, data: { markupOverridePercent: original.markup } });
      if (addedImageId) await db.image.delete({ where: { id: addedImageId } });
    } finally {
      await db.$disconnect();
    }
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "escritorio-1280", width: 1280, height: 900 },
  ]) {
    test(`«Guardar cambios» guarda a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/productos/${PRODUCT}`);
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/${PRODUCT}`), { timeout: 120_000 });

      // La calculadora plegada arranca con el aumento de la categoría, por encima de 100.
      await expect(page.locator("#calculadora-incremento")).toHaveValue(String(MARKUP), { timeout: 90_000 });

      const name = `${original.name} ${viewport.width}`;
      const nameField = page.locator('input[name="name"]');
      await nameField.fill(name);
      await page.getByRole("button", { name: "Guardar cambios" }).click();

      const db = createTestPrismaClient("product-save-markup");
      try {
        await expect
          .poll(async () => (await db.product.findUniqueOrThrow({ where: { id: PRODUCT }, select: { name: true } })).name, { timeout: 60_000 })
          .toBe(name);
      } finally {
        await db.$disconnect();
      }
    });
  }
});
