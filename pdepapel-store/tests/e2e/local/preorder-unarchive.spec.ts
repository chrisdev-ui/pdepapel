import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { localApiUrl, LOCAL_STORE_PORT, purgeAdminProductCache, SEEDED_STORE_ID } from "./helpers/local-environment";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Lo que pasó con el calendario (2026-10-29): la preventa se abrió con el
 * producto archivado y luego se desarchivó. Aquí, igual: archivado la ficha
 * redirige; desarchivado y revalidado como lo hace el panel (versión 2 con
 * las mismas rutas y etiquetas), la ficha, la tarjeta de la categoría, la
 * búsqueda de la tienda y el desplegable del buscador dicen preventa, nunca
 * «Agotado».
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "tmp/preventa-desarchivar-shots");
const NAME = "Calendario de adviento E2E";

function seed(mode: "seed" | "clean" | "archive" | "unarchive") {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-preorder.ts", mode], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  return output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "{}";
}

const shot = async (page: Page, name: string) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
};

let slug = "";
let productId = "";
let categorySlug = "";
let categoryId = "";

/** Lo que hace el panel al guardar el producto: vacía su caché y purga la tienda (versión 2, rutas y etiquetas). */
async function purgeLikeThePanel() {
  expect(categorySlug).not.toBe("");
  await purgeAdminProductCache(SEEDED_STORE_ID);
  const revalidate = await fetch(`http://localhost:${LOCAL_STORE_PORT}/api/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-secret": "test-stub" },
    body: JSON.stringify({
      version: 2,
      paths: ["/tienda", "/", `/producto/${slug}`, `/categoria/${categorySlug}`],
      tags: ["products:list", `product:${productId}`, `product:${slug}`, `products:category:${categoryId}`, `products:category:${categorySlug}`],
    }),
  });
  expect(revalidate.status).toBe(200);
}

test.describe("preventa abierta con el producto archivado y luego desarchivado", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async () => {
    ({ slug, productId } = JSON.parse(seed("seed")));
    const product = (await (await fetch(`${localApiUrl(SEEDED_STORE_ID)}/products/${slug}?scope=storefront`, { signal: AbortSignal.timeout(180_000) })).json()) as {
      category?: { slug?: string; id?: string };
    };
    categorySlug = product.category?.slug ?? "";
    categoryId = product.category?.id ?? "";
    await purgeLikeThePanel();
  });
  test.afterAll(() => {
    seed("clean");
  });

  const expectPreorderCard = async (page: Page) => {
    const card = page.getByRole("link", { name: new RegExp(NAME) }).first().locator("xpath=ancestor::*[self::article or self::li][1]");
    await expect(card).toContainText("Preventa", { timeout: 60_000 });
    await expect(card).not.toContainText("Agotado");
  };

  test("la búsqueda (página y desplegable) dice «Preventa», no «Agotado»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipPrivacyBanner(page);
    await page.goto(`/tienda?search=${encodeURIComponent("calendario adviento")}`);
    await expectPreorderCard(page);
    await shot(page, "busqueda-tienda-390");

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const box = page.getByRole("searchbox", { name: "Buscar productos" }).or(page.getByRole("combobox", { name: "Buscar productos" })).filter({ visible: true }).first();
    await box.click();
    await box.fill("calendario de adviento");
    const option = page.getByRole("option").filter({ hasText: NAME }).first();
    await expect(option).toBeVisible({ timeout: 60_000 });
    await expect(option).toContainText("Preventa");
    await expect(option).not.toContainText("Agotado");
    await shot(page, "buscador-1280");
  });

  test("archivado redirige; desarchivado y revalidado se vende como preventa en ficha y categoría", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipPrivacyBanner(page);

    // Archivado: la ficha no se muestra (redirige a lo más parecido a la venta).
    seed("archive");
    await purgeLikeThePanel();
    await page.goto(`/producto/${slug}`);
    await expect(page).not.toHaveURL(new RegExp(`/producto/${slug}$`), { timeout: 60_000 });

    // Paula lo desarchiva; el panel purga su caché y revalida la tienda con su carga v2.
    seed("unarchive");
    await purgeLikeThePanel();

    await page.goto(`/producto/${slug}`);
    await expect(page.getByRole("button", { name: /Reservar con anticipo/ }).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Agotado/)).toHaveCount(0);
    await shot(page, "ficha-desarchivada-390");

    await page.goto(`/categoria/${categorySlug}`);
    await expectPreorderCard(page);
    await shot(page, "categoria-desarchivada-390");
  });
});
