import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Precios (#116) a 390 y 768 px: la calculadora de la ficha dice de dónde sale
 * el aumento y calcula (costo + envío) × (1 + aumento); Configuración muestra el
 * margen mínimo y los ajustes de Mercado Libre; la subcategoría su aumento
 * propio con la mediana. Nada se guarda. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/pricing-settings.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/pricing-shots");
const PRODUCT = "e2e-fair-product";

test.use({ trace: "off" });

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** El formateador del panel pone un espacio que no se parte entre «$» y el número. */
const pesos = (value: number) => new RegExp(`\\$\\s${Math.round(value).toLocaleString("es-CO").replace(/\./g, "\\.")}(?!\\d)`);

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Precios en el panel",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("precios en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
  ]) {
    test(`calculadora, Configuración y subcategoría a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const writes: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) writes.push(`${request.method()} ${request.url()}`);
      });
      const db = createTestPrismaClient("pricing-settings");
      const product = await db.product.findUniqueOrThrow({ where: { id: PRODUCT }, select: { acqPrice: true, transportationCost: true, categoryId: true } });
      await db.$disconnect();

      // Ficha: el aumento sugerido y su fuente; lo escrito por Paula y «Usar el sugerido».
      await signIn(page, `/${storeId}/productos/${PRODUCT}`);
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/${PRODUCT}`));
      const calculator = page.locator("details", { hasText: "Calculadora de precio (no se guarda)" });
      await expect(async () => {
        await calculator.locator("summary").scrollIntoViewIfNeeded({ timeout: 1000 });
        await calculator.locator("summary").click();
        await expect(calculator.getByTestId("calculator-markup-source")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await expect(calculator.getByTestId("calculator-markup-source")).toContainText(/^Aumento sugerido: /);
      const percentInput = calculator.getByLabel("Incremento sobre el costo");
      await percentInput.fill("50");
      await expect(calculator.getByTestId("calculator-markup-source")).toContainText("Aumento escrito por ti.");
      const cost = (product.acqPrice ?? 0) + (product.transportationCost && product.transportationCost !== 1000 ? product.transportationCost : 0);
      await expect(calculator).toContainText(pesos(cost * 1.5));
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-calculadora.png`), fullPage: false });
      await calculator.getByRole("button", { name: /Usar el sugerido/ }).click();
      await expect(calculator.getByTestId("calculator-markup-source")).toContainText(/^Aumento sugerido: /);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // Configuración › Envíos y empaques: margen mínimo y ajustes de Mercado Libre.
      await page.goto(`/${storeId}/configuracion?tab=envios`, { waitUntil: "domcontentloaded" });
      const minimum = page.getByLabel("Margen mínimo de la tienda (%)");
      // El formulario se vuelve a montar al hidratar: el desplazamiento va dentro del reintento.
      await expect(async () => {
        await minimum.scrollIntoViewIfNeeded({ timeout: 1000 });
        await expect(minimum).toHaveValue("35", { timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await expect(page.getByLabel("Cargo fijo por unidad en precios bajos (COP)")).toHaveAttribute("placeholder", "No registrado");
      await expect(page.getByLabel("Precio límite del cargo fijo (COP)")).toHaveAttribute("placeholder", "No registrado");
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-configuracion.png`), fullPage: false });
      await expect(async () => {
        await page.getByLabel("Cargo fijo por unidad en precios bajos (COP)").scrollIntoViewIfNeeded({ timeout: 1000 });
      }).toPass({ timeout: 30_000 });
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-configuracion-ml.png`), fullPage: false });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // Subcategoría: aumento propio vacío y la mediana a la vista.
      await page.goto(`/${storeId}/categorias/${product.categoryId}`, { waitUntil: "domcontentloaded" });
      const override = page.getByLabel("Aumento sugerido (%)");
      await expect(async () => {
        await override.scrollIntoViewIfNeeded({ timeout: 1000 });
        await expect(override).toHaveValue("", { timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await expect(page.getByTestId("category-median-markup")).toContainText(/^Vacío usa la mediana: hoy .+ %, .+\.$/);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-subcategoria.png`), fullPage: false });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      expect(writes).toEqual([]);
    });
  }
});
