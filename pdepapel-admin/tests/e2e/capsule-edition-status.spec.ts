import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Poner una edición a la venta y cerrarla piden confirmación en el taller:
 * «La edición quedará a la venta en la tienda». Cancelar no cambia nada;
 * «Pausar la venta» la devuelve a vista previa sin diálogo.
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/capsulas-shots");
const CATEGORY_ID = "00000000-0000-4000-8000-000000000002";
const NUMBER = 1390;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let editionId = "";
const productId = "e2e-capsule-status-edition";

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de estados de una edición de cápsulas",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

const status = () => db.capsuleEdition.findUniqueOrThrow({ where: { id: editionId }, select: { status: true } }).then((row) => row.status);

test.describe("estados de una edición de cápsulas", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("capsule-edition-status");
    // Una sola edición LIVE por tienda: ninguna otra prueba deja una abierta.
    await db.capsuleEdition.updateMany({ where: { storeId, status: "LIVE" }, data: { status: "PREVIEW" } });
    const seed = await db.product.findUniqueOrThrow({ where: { id: "e2e-fair-product" }, select: { sizeId: true, colorId: true, designId: true } });
    await db.product.create({
      data: { id: productId, storeId, categoryId: CATEGORY_ID, sizeId: seed.sizeId, colorId: seed.colorId, designId: seed.designId, description: "Producto de pruebas de cápsulas", name: "Cápsula estados", slug: "capsula-estados-e2e", sku: "E2E-CAP-STATUS", stock: 0, price: 12900, acqPrice: 0, isArchived: true },
    });
    const edition = await db.capsuleEdition.create({
      data: { storeId, number: NUMBER, name: "Estados", theme: "escritorio", productId, costBandMin: 3000, costBandMax: 5000, status: "PREVIEW" },
    });
    editionId = edition.id;
    await db.capsulePackOption.create({ data: { editionId, packSize: 5 } });
  });
  test.afterAll(async () => {
    if (!db) return;
    await db.capsuleSlip.deleteMany({ where: { editionId } });
    await db.capsulePackOption.deleteMany({ where: { editionId } });
    await db.capsuleEdition.deleteMany({ where: { id: editionId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "1280", width: 1280, height: 800 },
  ]) {
    test(`poner a la venta, pausar y cerrar piden lo que deben a ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await db.capsuleEdition.update({ where: { id: editionId }, data: { status: "PREVIEW" } });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/productos/ediciones/${editionId}`);
      await expect(page.getByRole("heading", { name: `#${NUMBER} · Estados` })).toBeVisible({ timeout: 90_000 });

      await page.getByRole("button", { name: "Poner a la venta" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("La edición quedará a la venta en la tienda");
      await dialog.screenshot({ path: path.join(SHOTS, `estado-${viewport.name}-confirmar-venta.png`) });
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog).toBeHidden();
      expect(await status()).toBe("PREVIEW");

      await page.getByRole("button", { name: "Poner a la venta" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Poner a la venta" }).click();
      await expect(page.getByRole("button", { name: "Pausar la venta" })).toBeVisible({ timeout: 30_000 });
      await expect.poll(status).toBe("LIVE");

      await page.getByRole("button", { name: "Pausar la venta" }).click();
      await expect(page.getByRole("button", { name: "Poner a la venta" })).toBeVisible({ timeout: 30_000 });
      await expect.poll(status).toBe("PREVIEW");

      if (viewport.name === "1280") {
        await db.capsuleEdition.update({ where: { id: editionId }, data: { status: "LIVE" } });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Cerrar edición" }).click();
        const close = page.getByRole("alertdialog");
        await expect(close).toContainText("La edición sale de la tienda y deja de venderse.");
        await expect(close).toContainText("Cerrar no se deshace.");
        await close.getByRole("button", { name: "Cerrar edición" }).click();
        await expect.poll(status).toBe("CLOSED");
      }
    });
  }
});
