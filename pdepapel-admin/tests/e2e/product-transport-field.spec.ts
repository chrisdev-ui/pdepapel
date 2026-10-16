import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { expect, test } from "./helpers/image-stub";

/**
 * «Envío y otros gastos» en la ficha de un producto nuevo, a 390 y 768 px:
 * «Envío de la compra (solo este producto)» reparte el envío entre las unidades y el aviso aparece
 * cuando el envío por unidad parece el de una orden. No guarda nada.
 *
 *   npm run test:e2e -- tests/e2e/product-transport-field.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/transport-shots");

test.use({ trace: "off" });

test.describe("envío por unidad en la ficha", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
  ]) {
    test(`por unidad o de toda la compra, con aviso, sin desbordar a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith(`/api/${storeId}/products`)) posts.push(request.url());
      });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Envío por unidad en la ficha",
        redirectUrl: new URL(`/${storeId}/productos/nuevo`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/${storeId}/productos/nuevo`));

      const field = page.getByTestId("transport-cost-field");
      // La ficha se vuelve a montar al hidratar: el desplazamiento va dentro del reintento.
      await expect(async () => {
        await field.scrollIntoViewIfNeeded({ timeout: 1000 });
        await field.getByRole("button", { name: "Envío de la compra (solo este producto)" }).click();
        await expect(field.getByRole("button", { name: "Envío de la compra (solo este producto)" })).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await field.getByLabel("Envío de la compra", { exact: true }).fill("1000");
      await field.getByLabel("Unidades de la compra").fill("100");
      await expect(field.getByTestId("transport-per-unit")).toContainText("10 por unidad");
      // Visible de verdad: lo que está encima en el centro de la línea es la línea misma, no la barra fija.
      const uncovered = (testId: string) =>
        field.getByTestId(testId).evaluate((element) => {
          const box = element.getBoundingClientRect();
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return box.top >= 0 && box.bottom <= window.innerHeight && top !== null && element.contains(top);
        });
      expect(await uncovered("transport-per-unit")).toBe(true);
      await expect(field.getByTestId("transport-order-hint")).toHaveText("Si la compra trajo varios productos, corrige el envío en el pedido (Aprovisionamiento → Pedido).");
      expect(await uncovered("transport-order-hint")).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-envio-de-la-compra.png`), fullPage: false });

      // Un envío por unidad que parece de toda una orden: aviso, sin bloquear.
      await page.getByLabel("Costo de compra").fill("160");
      await field.getByRole("button", { name: "Por unidad" }).click();
      await field.getByLabel("Envío por unidad").fill("1000");
      await expect(field.getByTestId("transport-warning")).toContainText("igual o mayor que el costo de compra");
      expect(await uncovered("transport-warning")).toBe(true);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-aviso.png`), fullPage: false });

      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(posts).toEqual([]);
    });
  }
});
