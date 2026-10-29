import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { fillContact, formButton } from "./helpers/checkout";
import { localApiUrl, readOrderFromAdmin, SEEDED_STORE_ID, stubDaneLookup } from "./helpers/local-environment";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Preventa con anticipo contra la administración local, a 390, 768 y 1280: la
 * ficha muestra el precio completo, el anticipo, «por confirmar», «Cómo
 * funciona la preventa» y la lista de espera; la caja pide aceptar las
 * condiciones, no cotiza envío y cobra solo el anticipo. A 390 se crea el
 * pedido por transferencia y queda con anticipo de $30.000 sobre $160.000.
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "tmp/preventa-anticipo-shots");

function seed(mode: "seed" | "clean") {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-preorder.ts", mode], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  return output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "{}";
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page: Page, name: string) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
};

let slug = "";

async function openProduct(page: Page) {
  await skipPrivacyBanner(page);
  // Solo en la primera carga: después el carrito que arma la prueba tiene que quedar.
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("e2e-preorder-cleared")) return;
    window.sessionStorage.setItem("e2e-preorder-cleared", "1");
    window.localStorage.removeItem("cart-storage");
    window.localStorage.removeItem("checkout-storage");
  });
  expect((await page.goto(`/producto/${slug}`))?.status()).toBe(200);
  await expect(page.getByText(/Resérvalo hoy con \$\s?30\.000 de anticipo/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Fecha estimada: por confirmar").first()).toBeVisible();
  await expect(page.getByText("Cómo funciona la preventa").first()).toBeVisible();
  await expect(page.getByText("¿Prefieres esperar? Te avisamos cuando llegue").first()).toBeVisible();
}

async function goToDepositPayment(page: Page) {
  await page.getByRole("button", { name: /Reservar con anticipo/ }).filter({ visible: true }).first().click();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("cart-storage") ?? "{}")?.state?.items?.length ?? 0), { timeout: 30_000 })
    .toBe(1);
  await stubDaneLookup(page);
  await page.route("**/boldPaymentButton.js", (route) => route.abort());
  await page.goto("/finalizar-compra");
  await fillContact(page);
  await expect(page.getByTestId("deposit-shipping-note")).toBeVisible();
  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click();
  await city.fill("Medell");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await page.getByLabel(/^Dirección \*/).fill("Calle 123 # 45-67");
  await formButton(page, "Continuar al pago").click();
  await expect(page.getByRole("heading", { name: "Pago y confirmación" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Contra entrega", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("deposit-terms-checkbox")).not.toBeChecked();
}

test.describe("preventa con anticipo en la tienda", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async () => {
    slug = JSON.parse(seed("seed")).slug;
    // La administración local corre en modo dev: la primera vez compila la ruta
    // del producto, y bajo carga eso pasa el límite de espera de la tienda.
    const response = await fetch(`${localApiUrl(SEEDED_STORE_ID)}/products/${slug}?include=kitComponents&scope=storefront`, {
      signal: AbortSignal.timeout(180_000),
    });
    expect(response.status, await response.clone().text().then((text) => text.slice(0, 300))).toBe(200);
    // Lo mismo con la caja: compilarla tarda más que el límite de 20 s del navegador.
    // Un POST vacío carga todo el manejador y responde 400 sin crear nada.
    const warm = await fetch(`${localApiUrl(SEEDED_STORE_ID)}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(180_000),
    });
    expect(warm.status).toBe(400);
  });
  test.afterAll(() => {
    seed("clean");
  });

  test("ficha, caja y pedido por transferencia, a 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProduct(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "tienda-ficha-390");

    await goToDepositPayment(page);
    await page.getByText("Transferencia bancaria", { exact: true }).click();
    const pay = formButton(page, /Pagar anticipo \$\s?30\.000/);
    await expect(pay).toBeVisible();
    await page.getByTestId("deposit-terms-checkbox").check();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "tienda-caja-390");
    await pay.click();
    await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
    const orderId = new URL(page.url()).pathname.split("/").pop()!;

    const order = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(order).toMatchObject({ paymentPlan: "DEPOSIT", status: "PENDING" });
    expect(Number(order.depositAmount)).toBe(30000);
    expect(Number(order.total)).toBe(160000);
    await expect(page.getByText(/Paga el anticipo de \$\s?30\.000/).first()).toBeVisible({ timeout: 30_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "tienda-pedido-390");
  });

  for (const viewport of [
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`ficha y caja con anticipo a ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openProduct(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await shot(page, `tienda-ficha-${viewport.name}`);
      await goToDepositPayment(page);
      await expect(formButton(page, /Pagar anticipo \$\s?30\.000/)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await shot(page, `tienda-caja-${viewport.name}`);
    });
  }
});
