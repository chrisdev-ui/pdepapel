import { createClerkClient } from "@clerk/backend";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Marcas en el panel a 390 y 1280 px: crear una marca, asignarla desde
 * «Sugerencias automáticas», desde la ficha («¿Es de la marca…? Usar…»), en
 * lote desde Productos, fusionar dos marcas y hacer de una marca una línea
 * de otra (la madre no se deja archivar mientras tenga líneas). Escribe en la base de pruebas;
 * cada vuelta deja la tienda E2E sin marcas y sus productos de marca
 * archivados, como los deja el seed.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/brands.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);

const KIUT_1 = "e2e-brand-kiut-1";
const KIUT_2 = "e2e-brand-kiut-2";
const PLAIN = "e2e-brand-plain";
const BRAND_PRODUCTS = [KIUT_1, KIUT_2, PLAIN];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Marcas",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(target.replace(/[?]/g, "\\?")), { timeout: 120_000 });
}

async function resetBrands(active: boolean) {
  const db = createTestPrismaClient("brands-e2e");
  try {
    await db.product.updateMany({ where: { storeId }, data: { brandId: null } });
    await db.productGroup.updateMany({ where: { storeId }, data: { brandId: null } });
    await db.brandSlugRedirect.deleteMany({ where: { storeId } });
    // La relación madre → línea es Restrict: se suelta antes de borrar.
    await db.brand.updateMany({ where: { storeId }, data: { parentBrandId: null } });
    await db.brand.deleteMany({ where: { storeId } });
    await db.product.updateMany({ where: { id: { in: BRAND_PRODUCTS } }, data: { isArchived: !active } });
  } finally {
    await db.$disconnect();
  }
}

async function brandIdsOf(ids: string[]) {
  const db = createTestPrismaClient("brands-e2e");
  try {
    const rows = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, brandRef: { select: { name: true } } } });
    return Object.fromEntries(rows.map((row) => [row.id, row.brandRef?.name ?? null]));
  } finally {
    await db.$disconnect();
  }
}

async function createBrandRows(names: string[]) {
  const db = createTestPrismaClient("brands-e2e");
  try {
    const created: Record<string, string> = {};
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      const brand = await db.brand.create({
        data: { storeId, name, slug: name.toLowerCase(), aliases: [], sortOrder: index, logoPermission: "UNKNOWN" },
      });
      created[name] = brand.id;
    }
    return created;
  } finally {
    await db.$disconnect();
  }
}

const visible = (locator: Locator) => locator.filter({ visible: true }).first();

/** El selector de marca: hoja inferior con radios en el teléfono, lista con búsqueda en escritorio. */
async function pickBrand(page: Page, trigger: Locator, name: string, phone: boolean) {
  await trigger.click();
  if (phone) {
    const sheet = page.getByRole("dialog", { name: "Marca" });
    await expect(sheet).toBeVisible();
    // El nombre accesible empieza por el logo («Sin logo») cuando la marca no tiene.
    await sheet.getByRole("radio", { name: new RegExp(`\\b${name}\\b`) }).check();
  } else {
    await visible(page.getByRole("option", { name: new RegExp(`\\b${name}\\b`) })).click();
  }
}

test.describe("marcas en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");
  test.afterAll(async () => resetBrands(false));

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844, phone: true },
    { name: "escritorio-1280", width: 1280, height: 900, phone: false },
  ]) {
    test(`crear, sugerencias, ficha, lote y fusión a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(420_000);
      await resetBrands(true);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // 1. Crear la marca desde la lista.
      await signIn(page, `/${storeId}/marcas`);
      await visible(page.getByRole("link", { name: /Nueva marca/ }).or(page.getByRole("button", { name: /Nueva marca/ }))).click();
      await page.getByLabel(/^Nombre/).first().fill("Kiut");
      await page.getByRole("button", { name: "Crear marca" }).click();
      await expect(page).toHaveURL(new RegExp(`/${storeId}/marcas/(?!nueva)[\\w-]+$`), { timeout: 60_000 });
      const kiutId = new URL(page.url()).pathname.split("/").pop()!;
      expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width).toBe(true);

      // 2. Sugerencias automáticas: los dos productos que dicen «Kiut», ya marcados.
      await page.goto(`/${storeId}/marcas/sugerencias`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Sugerencias automáticas" })).toBeVisible({ timeout: 60_000 });
      const assign = page.getByRole("button", { name: /Asignar Kiut a 2 productos/ });
      await expect(assign).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("checkbox", { name: /Cuaderno Kiut E2E/ })).toBeChecked();
      await assign.click();
      await expect.poll(() => brandIdsOf([KIUT_1, KIUT_2]), { timeout: 30_000 }).toEqual({ [KIUT_1]: "Kiut", [KIUT_2]: "Kiut" });

      // 3. Ficha: sin marca, el nombre la sugiere y «Usar Kiut» la elige; guardar la escribe.
      // Precio 9000 sobre costo 3000: aumento de 200 %, que la calculadora plegada ya no deja bloquear el envío.
      const db = createTestPrismaClient("brands-e2e");
      await db.product.update({ where: { id: KIUT_1 }, data: { brandId: null } });
      await db.$disconnect();
      await page.goto(`/${storeId}/productos/${KIUT_1}`, { waitUntil: "domcontentloaded" });
      const useKiut = page.getByRole("button", { name: "Usar Kiut" });
      await expect(useKiut).toBeVisible({ timeout: 90_000 });
      await useKiut.click();
      await expect(visible(page.getByRole("combobox").filter({ hasText: "Kiut" }))).toBeVisible();
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect.poll(() => brandIdsOf([KIUT_1]), { timeout: 60_000 }).toEqual({ [KIUT_1]: "Kiut" });

      // 4. En lote desde Productos.
      await createBrandRows(["Norma"]);
      await page.goto(`/${storeId}/productos`, { waitUntil: "domcontentloaded" });
      const plainName = "Borrador blanco E2E";
      if (viewport.phone) {
        // En el teléfono las tarjetas muestran la casilla solo en modo «Seleccionar».
        await visible(page.getByRole("button", { name: "Seleccionar", exact: true })).click({ timeout: 90_000 });
        await visible(page.getByRole("checkbox", { name: `Seleccionar ${plainName}` })).check();
      } else {
        await visible(page.getByRole("row").filter({ hasText: plainName }).getByRole("checkbox", { name: "Seleccionar fila" })).check();
      }
      await visible(page.getByRole("button", { name: "Asignar marca" })).click();
      const dialog = page.getByRole("dialog", { name: /Asignar marca a 1 producto/ });
      await expect(dialog).toBeVisible();
      await pickBrand(page, dialog.getByRole("combobox"), "Norma", viewport.phone);
      await page.getByRole("button", { name: "Asignar Norma a 1 producto" }).click();
      await expect.poll(() => brandIdsOf([PLAIN]), { timeout: 30_000 }).toEqual({ [PLAIN]: "Norma" });

      // 5. Fusionar Norma en Kiut: el producto pasa a Kiut y Norma queda archivada con su dirección redirigida.
      await page.goto(`/${storeId}/marcas`, { waitUntil: "domcontentloaded" });
      await visible(page.getByRole("button", { name: "Acciones de la marca Norma" })).click();
      await page.getByRole("menuitem", { name: /Fusionar con otra marca/ }).click();
      const merge = page.getByRole("dialog", { name: /Fusionar «Norma» en/ });
      await expect(merge).toBeVisible();
      await merge.getByRole("combobox").click();
      await visible(page.getByRole("option", { name: "Kiut" })).click();
      await expect(merge.getByText("Al fusionar:")).toBeVisible();
      await merge.getByRole("button", { name: "Fusionar en Kiut" }).click();
      await expect.poll(() => brandIdsOf([PLAIN]), { timeout: 30_000 }).toEqual({ [PLAIN]: "Kiut" });
      const check = createTestPrismaClient("brands-e2e");
      const [norma, redirect] = await Promise.all([
        check.brand.findFirst({ where: { storeId, name: "Norma" }, select: { isArchived: true } }),
        check.brandSlugRedirect.findFirst({ where: { storeId, oldSlug: "norma" }, select: { brandId: true } }),
      ]);
      await check.$disconnect();
      expect(norma?.isArchived).toBe(true);
      expect(redirect).not.toBeNull();

      // 6. «Es una línea de»: Flower pasa a ser una línea de Kiut.
      const { Flower: flowerId } = await createBrandRows(["Flower"]);
      await page.goto(`/${storeId}/marcas/${flowerId}`, { waitUntil: "domcontentloaded" });
      const parentField = page.getByRole("combobox", { name: "Es una línea de" });
      await expect(parentField).toBeVisible({ timeout: 60_000 });
      await parentField.click();
      await visible(page.getByRole("option", { name: "Kiut" })).click();
      await expect(parentField).toHaveText(/Kiut/);
      await page.getByRole("button", { name: "Guardar marca" }).click();
      await expect
        .poll(
          async () => {
            const read = createTestPrismaClient("brands-e2e");
            try {
              return (await read.brand.findUnique({ where: { id: flowerId }, select: { parentBrandId: true } }))?.parentBrandId;
            } finally {
              await read.$disconnect();
            }
          },
          { timeout: 30_000 },
        )
        .toBe(kiutId);

      // 7. La lista la muestra debajo de Kiut y Kiut no se deja archivar mientras tenga líneas.
      await page.goto(`/${storeId}/marcas`, { waitUntil: "domcontentloaded" });
      await expect(visible(page.getByText("línea de Kiut"))).toBeVisible({ timeout: 60_000 });
      await visible(page.getByRole("button", { name: "Acciones de la marca Kiut" })).click();
      await page.getByRole("menuitem", { name: "Archivar" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Archivar" }).click();
      // El aviso de error vive en la región de notificaciones de Radix («Notifications (F8)»).
      await expect(page.getByRole("region", { name: /Notifications/ }).getByText(/líneas/).first()).toBeVisible({ timeout: 30_000 });
      const after = createTestPrismaClient("brands-e2e");
      const kiut = await after.brand.findUnique({ where: { id: kiutId }, select: { isArchived: true } });
      await after.$disconnect();
      expect(kiut?.isArchived).toBe(false);
      expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width).toBe(true);
    });
  }
});
