import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "../helpers/safe-test";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * La página de una edición de cápsulas con la venta apagada: 404 sin enlace o
 * con un enlace equivocado; con el enlace de vista previa, la galería sin
 * precios, los packs (solo hasta el 25 % de los papeles), los cupos del día,
 * el permiso del video y la compra en «Muy pronto». A 390, 768 y 1280.
 *
 * La edición la imprime la administración por el camino real
 * (`scripts/seed-e2e-capsule-edition.ts`): 40 papeles, así que caben los
 * packs de 5 y 10.
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "output/screenshots/capsulas-p3");

function runSeed(mode: "seed" | "clean") {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-capsule-edition.ts", mode], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  // Lo último que imprime puede ser un registro de Prisma de una tarea en segundo plano: vale la última línea JSON.
  return output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "";
}

let edition: { segment: string; token: string };

test.describe("cápsulas: la edición en la tienda", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    edition = JSON.parse(runSeed("seed"));
  });
  test.afterAll(() => {
    runSeed("clean");
  });

  test("sin enlace o con un enlace equivocado no existe", async ({ page }) => {
    const plain = await page.goto(`/capsulas/${edition.segment}`);
    expect(plain?.status()).toBe(404);
    const wrong = await page.goto(`/capsulas/${edition.segment}?vista=${edition.token.slice(0, -4)}abcd`);
    expect(wrong?.status()).toBe(404);
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`vista previa a ${viewport.width}`, async ({ page }) => {
      const hydration: string[] = [];
      page.on("pageerror", (error) => hydration.push(String(error)));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await skipPrivacyBanner(page);
      const response = await page.goto(`/capsulas/${edition.segment}?vista=${edition.token}`);
      expect(response?.status()).toBe(200);

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.getByRole("heading", { level: 1, name: "Escritorio" })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Vista previa" })).toBeVisible();
      await expect(page.getByText("1 cápsula = 1 producto sorpresa")).toBeVisible();

      const gallery = page.locator("section", { has: page.getByRole("heading", { name: "Lo que puede salir" }) });
      await expect(gallery.getByText("Lapicero estrellita")).toBeVisible();
      await expect(gallery.getByText("Borrador nube")).toBeVisible();
      await expect(gallery).not.toContainText("$");

      const packs = page.getByRole("radiogroup", { name: "Packs de cápsulas" });
      await expect(packs.getByRole("radio")).toHaveCount(6);
      await expect(packs.getByRole("radio", { disabled: false })).toHaveCount(2);
      await expect(packs.getByText("No disponible en esta edición")).toHaveCount(4);
      const ten = packs.locator("label", { hasText: "Pack de 10" });
      await expect(ten).toContainText("por cápsula");
      await expect(ten).toContainText("Ahorras");
      await expect(ten).toContainText("1 regalo sorpresa");

      await expect(page.getByText("Tu pack de 5 viaja en una caja")).toBeVisible();
      await ten.click();
      await expect(page.getByText("Tu pack de 10 viaja en una caja")).toBeVisible();

      await expect(page.getByTestId("cupos-del-dia")).toContainText(/Cupos de hoy: \d+ de 5/);
      await expect(page.getByRole("radio", { name: /el video de mi apertura es solo para mí/ })).toBeChecked();
      await expect(page.getByRole("button", { name: "Muy pronto" })).toBeDisabled();
      await expect(page.locator("body")).not.toContainText(/lucky/i);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(hydration).toEqual([]);

      mkdirSync(SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SCREENSHOTS, `tienda-edicion-${viewport.name}.png`), fullPage: true });
    });
  }
});
