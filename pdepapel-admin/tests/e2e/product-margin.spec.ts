import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Margen de la ficha (#116 C) a 390 y 768 px: con el costo de compra y el
 * envío por unidad, el aviso de «Envío no registrado» y el margen mínimo de la
 * tienda; la barra fija de guardar no lo tapa. No guarda nada.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/product-margin.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/margin-shots");
const PRODUCT = "e2e-fair-product";

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

const pesos = (value: number) => new RegExp(`\\$\\s${Math.round(value).toLocaleString("es-CO").replace(/\./g, "\\.")}(?!\\d)`);

/** En el centro de la pantalla y sin nada encima (la barra fija de guardar tapa lo que queda abajo). */
const centeredAndUncovered = (locator: Locator) =>
  locator.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + Math.min(box.width / 2, 40), box.top + box.height / 2);
    return box.top >= 0 && box.bottom <= window.innerHeight && top !== null && element.contains(top);
  });

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Margen de la ficha",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("margen en la ficha", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
  ]) {
    test(`con envío, sin envío y bajo el mínimo a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const writes: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) writes.push(`${request.method()} ${request.url()}`);
      });
      const db = createTestPrismaClient("product-margin");
      const [product, store] = await Promise.all([
        db.product.findUniqueOrThrow({ where: { id: PRODUCT }, select: { acqPrice: true } }),
        db.store.findUniqueOrThrow({ where: { id: storeId }, select: { storeMinMarginPercent: true } }),
      ]);
      await db.$disconnect();
      const acq = product.acqPrice ?? 0;
      const minimum = store.storeMinMarginPercent ?? 35;

      await signIn(page, `/${storeId}/productos/${PRODUCT}`);
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/${PRODUCT}`));
      const price = page.getByLabel("Precio de venta");
      const shipping = page.getByLabel("Envío por unidad");
      const margin = page.getByTestId("product-margin");
      // La ficha se vuelve a montar al hidratar: lo primero va dentro del reintento.
      await expect(async () => {
        await shipping.fill("", { timeout: 1000 });
        await price.fill(String(Math.round(acq * 1.25)), { timeout: 1000 });
        await expect(margin).toContainText("Envío no registrado: el margen real puede ser menor.", { timeout: 1000 });
      }).toPass({ timeout: 60_000 });

      // Sin envío: margen sobre la compra, el aviso y el mínimo de la tienda con el precio que llega.
      await expect(margin).toContainText("Margen 20 % · ganas");
      await expect(margin).toContainText(`Por debajo del margen mínimo de la tienda (${minimum} %)`);
      await expect(margin).toContainText(pesos(Math.ceil(acq / (1 - minimum / 100) - 1e-6)));
      expect(await centeredAndUncovered(margin)).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-sin-envio.png`), fullPage: false });

      // Con envío por unidad: entra al costo y lo dice.
      const perUnit = Math.round(acq * 0.1);
      await shipping.fill(String(perUnit));
      await expect(margin).toContainText("(con envío)");
      await expect(margin).not.toContainText("Envío no registrado");
      await expect(margin).toContainText(pesos(Math.ceil((acq + perUnit) / (1 - minimum / 100) - 1e-6)));
      expect(await centeredAndUncovered(margin)).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-con-envio.png`), fullPage: false });

      // Entre la compra y compra + envío: aviso con el monto, no bloqueo (sin la casilla de «Vender con pérdida»).
      await price.fill(String(acq + Math.round(perUnit / 2)));
      await expect(margin).toContainText("Con el envío, este precio queda por debajo del costo: pierdes");
      await expect(page.getByText("Vender con pérdida a propósito")).toHaveCount(0);
      expect(await centeredAndUncovered(margin)).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-aviso-envio.png`), fullPage: false });

      // Debajo de la compra: el bloqueo de siempre.
      await price.fill(String(Math.max(1, acq - 100)));
      await expect(page.getByText("Vender con pérdida a propósito")).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      expect(writes).toEqual([]);
    });
  }
});
