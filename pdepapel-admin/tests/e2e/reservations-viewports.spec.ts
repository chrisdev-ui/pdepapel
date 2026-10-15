import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";

/**
 * «Reservar» desde la ficha del producto y la pantalla Reservas, en el
 * teléfono, la tableta y el computador: la hoja abre desde abajo, la reserva
 * se crea, la tarjeta aparece con su cuenta regresiva y «Liberar» pide
 * confirmación. Nada se desborda a lo ancho. Con la base local de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e -- tests/e2e/reservations-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const productId = "e2e-fair-product";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/reservas-shots");

test.use({ trace: "off" });

/** La página entra con un fundido y la hoja se desliza: Playwright cuenta opacidad 0 y media animación como visibles. */
async function settled(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate(async (el) => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
          let lowest = 1;
          for (let node: Element | null = el; node; node = node.parentElement) lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
          return lowest;
        }),
      { timeout: 60_000 },
    )
    .toBe(1);
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.configure({ mode: "serial" });

test.describe("reservas en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1440", width: 1440, height: 900 },
  ]) {
    test(`reservar y liberar en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba de reservas en distintos tamaños",
        redirectUrl: new URL(`/${storeId}/productos/${productId}`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/${productId}`));

      const reserveButton = page.getByRole("button", { name: "Reservar", exact: true });
      await expect(reserveButton).toBeVisible({ timeout: 90_000 });
      const sheet = page.getByRole("dialog", { name: "Reservar" });
      await expect(async () => {
        await reserveButton.click();
        await expect(sheet).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });

      await settled(sheet);
      const box = await sheet.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      // Otras e2e de la misma corrida venden o apartan el mismo producto: se parte de lo que muestra la hoja.
      const availableText = (await sheet.getByTestId("reserve-available").textContent()) ?? "";
      const available = Number(availableText.match(/Disponibles para reservar: (\d+)/)?.[1]);
      const onShelf = Number(availableText.match(/stock (\d+)/)?.[1] ?? available);
      expect(available).toBeGreaterThan(0);
      await sheet.getByLabel("Clienta").fill("Clienta E2E");
      await sheet.getByLabel("Nota (opcional)").fill("Prueba automática");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-hoja.png`) });

      await sheet.getByRole("button", { name: "Reservar 1 unidad" }).click();
      await expect(sheet).toBeHidden({ timeout: 30_000 });
      await expect(page.getByText(/1 reservado/).first()).toBeVisible({ timeout: 30_000 });
      const breakdown = page.getByTestId("reserved-breakdown");
      await expect(breakdown).toContainText(`En bodega${onShelf}`);
      await expect(breakdown).toContainText(`Se pueden vender${available - 1}`);

      await page.goto(new URL(`/${storeId}/reservas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("reservation-card").filter({ hasText: "Clienta E2E" });
      await expect(card).toBeVisible({ timeout: 60_000 });
      await settled(card);
      await expect(card.getByText("1 × Producto feria E2E")).toBeVisible();
      await expect(card.getByText(/vence en 3 días/)).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-reservas.png`), fullPage: true });

      if (viewport.width === 390) {
        // Convertir lleva al pedido pendiente del panel; la reserva sigue guardando la unidad.
        // Hidratada cuando el menú «+ días» abre; Convertir se pulsa una sola vez (navega).
        await expect(async () => {
          await card.getByRole("button", { name: "+ días" }).click();
          await expect(page.getByRole("menuitem", { name: "1 día más" })).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 60_000 });
        await page.keyboard.press("Escape");
        await card.getByRole("button", { name: "Convertir" }).click();
        await page.waitForURL(new RegExp(`/${storeId}/pedidos/[^/?]+$`), { timeout: 120_000 });
        await expect(page.getByText("Producto feria E2E").first()).toBeVisible({ timeout: 90_000 });
        await expect(page.getByText("Clienta E2E").first()).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-pedido.png`) });

        await page.goto(new URL(`/${storeId}/reservas?filtro=convertidas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
        await expect(card).toBeVisible({ timeout: 60_000 });
        await settled(card);
        await expect(card.getByText("Con pedido", { exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Convertir" })).toHaveCount(0);
      }

      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "¿Liberar esta reserva?" });
      await expect(async () => {
        await card.getByRole("button", { name: "Liberar" }).click();
        await expect(confirm).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await settled(confirm);
      await confirm.getByRole("button", { name: "Liberar" }).click();
      await expect(page.getByTestId("reservation-card").filter({ hasText: "Clienta E2E" })).toHaveCount(0, { timeout: 30_000 });
      // La tarjeta se quita al instante; el aviso «Liberado» llega cuando el servidor confirmó.
      await expect(page.getByText("Liberado", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
  }
});
