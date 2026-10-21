import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { CART_STORAGE, fillContact, fillDeliveryWithoutCarrier, formButton } from "./helpers/checkout";
import { deliverBoldWebhook, readOrderFromAdmin, SEEDED_STORE_ID } from "./helpers/local-environment";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Comprar un pack de cápsulas de punta a punta contra la administración local
 * (con la venta encendida solo en pruebas): la edición a la venta → «Comprar
 * pack de 10» con permiso para el video → checkout solo en línea y sin cupones
 * (el carrito queda intacto) → pago por el webhook firmado de Bold → cupo
 * confirmado y costo provisional → sorteo y cierre por el camino real → el
 * recibo muestra lo que salió. Capturas a 390, 768 y 1280.
 *
 * La guía tras el cierre (envío con EnvioClick) se prueba en la e2e de la
 * administración, dentro de su servidor aislado: este pedido acuerda el envío
 * por WhatsApp y no compra guía.
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "output/screenshots/capsulas-p4");

function admin(...args: string[]) {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-capsule-edition.ts", ...args], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  // Lo último que imprime puede ser un registro de Prisma de una tarea en segundo plano: vale la última línea JSON.
  return output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "";
}

/** Lo que el recibo público no trae: el cupo y el costo, leídos en `pdepapel_test`. */
function readCapsuleRow(orderId: string) {
  const script =
    'const { PrismaClient } = require("@prisma/client"); const db = new PrismaClient();' +
    "Promise.all([db.capsuleOrder.findUnique({ where: { orderId: process.argv[1] }, select: { videoConsent: true, provisionalCost: true, costStatus: true } }), db.capsuleDailySlot.findUnique({ where: { orderId: process.argv[1] }, select: { status: true, slotNumber: true, expiresAt: true } })])" +
    ".then(([capsule, slot]) => { console.log(JSON.stringify({ capsule, slot })); return db.$disconnect(); });";
  const output = execFileSync("node", ["scripts/with-test-env.mjs", "node", "-e", script, orderId], { cwd: ADMIN_DIR, encoding: "utf8", env: { ...process.env, PRISMA_LOG: "" } });
  return JSON.parse(output.trim().split("\n").reverse().find((line) => line.startsWith("{"))!);
}

const screenshot = async (page: Page, name: string) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
};

let edition: { segment: string; productId: string };
let orderId: string;

test.describe("cápsulas: comprar un pack", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(() => {
    edition = JSON.parse(admin("seed-live"));
  });
  test.afterAll(() => {
    admin("clean");
  });

  test("de la edición al recibo con lo que salió, a 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipPrivacyBanner(page);
    await page.route("**/boldPaymentButton.js", (route) => route.abort());
    await page.route("**/api/locations**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA", city: "MEDELLÍN", department: "ANTIOQUIA", daneCode: "05001000", raw: { locationCode: "05001000", cityName: "MEDELLÍN", departmentName: "ANTIOQUIA" } }], count: 1 }),
      }),
    );
    // Un carrito normal ya armado: el pack no lo toca.
    await page.addInitScript((cart) => {
      if (!window.localStorage.getItem("cart-storage")) window.localStorage.setItem("cart-storage", JSON.stringify(cart));
      window.localStorage.removeItem("checkout-storage");
    }, CART_STORAGE);

    expect((await page.goto(`/capsulas/${edition.segment}`))?.status()).toBe(200);
    await expect(page.getByTestId("cupos-del-dia")).toContainText("Cupos de hoy: 5 de 5");
    await page.locator("label", { hasText: "Pack de 10" }).click();
    await page.getByRole("radio", { name: /pueden publicar mi video/ }).click();
    await screenshot(page, "tienda-edicion-a-la-venta-390");
    await page.getByRole("button", { name: "Comprar pack de 10" }).click();
    await page.waitForURL(/\/finalizar-compra\?capsulas=1/);

    await fillContact(page);
    await fillDeliveryWithoutCarrier(page);
    await expect(page.getByText("Los cupones no aplican a los packs de cápsulas.")).toBeVisible();
    await expect(page.getByText("Transferencia bancaria", { exact: true })).toBeVisible();
    await expect(page.getByText("Contra entrega", { exact: true })).toHaveCount(0);
    await screenshot(page, "tienda-checkout-pack-390");
    await page.getByText("Pago en línea", { exact: true }).click();
    await formButton(page, /Pagar \$/).click();
    await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
    orderId = new URL(page.url()).pathname.split("/").pop()!;

    const created = await readOrderFromAdmin(SEEDED_STORE_ID, orderId);
    expect(Number(created.total)).toBe(124900);
    expect(created.capsule).toMatchObject({ packSize: 10, giftLabel: "1 regalo sorpresa", drawCompleted: false, products: [] });
    expect(readCapsuleRow(orderId)).toMatchObject({ capsule: { videoConsent: "PUBLIC_FIRST_NAME", provisionalCost: null }, slot: { status: "HELD", slotNumber: 1 } });

    const webhook = await deliverBoldWebhook({ storeId: SEEDED_STORE_ID, type: "SALE_APPROVED", reference: created.orderNumber, total: Number(created.total) });
    expect(webhook.status).toBe(200);
    expect((await readOrderFromAdmin(SEEDED_STORE_ID, orderId)).status).toBe("PAID");
    // 10 papeles a 4.000 + el tope del regalo.
    expect(readCapsuleRow(orderId)).toMatchObject({ capsule: { provisionalCost: 42000, costStatus: "PROVISIONAL" }, slot: { status: "CONFIRMED" } });

    expect(JSON.parse(admin("draw-close", orderId))).toMatchObject({ guideQueued: false });
    expect(readCapsuleRow(orderId)).toMatchObject({ capsule: { costStatus: "REAL" } });

    await page.goto(`/pedido/${orderId}`);
    await expect(page.getByRole("heading", { name: "Tus cápsulas sorpresa" })).toBeVisible({ timeout: 30_000 });
    // 10 papeles de dos productos (agrupados con su cantidad) y el regalo.
    await expect(page.getByTestId("capsulas-que-salieron").getByRole("listitem")).toHaveCount(3);
    await expect(page.getByTestId("capsulas-que-salieron")).toContainText(/Lápiz conejito × \d+/);
    await expect(page.getByRole("button", { name: /Volver a pedir/ })).toHaveCount(0);
    await expect(page.getByTestId("capsulas-que-salieron")).toContainText("Llavero gatito (regalo)");
    await expect(page.locator("body")).not.toContainText(/lucky/i);
    await screenshot(page, "tienda-recibo-capsulas-390");

    // El carrito sigue con lo que tenía.
    const cart = await page.evaluate(() => JSON.parse(window.localStorage.getItem("cart-storage") ?? "{}"));
    expect(cart.state?.items?.length ?? 0).toBeGreaterThan(0);

    await page.goto(`/capsulas/${edition.segment}`);
    await expect(page.getByTestId("cupos-del-dia")).toContainText("Cupos de hoy: 4 de 5");
  });

  test("por transferencia: pedido pendiente con el cupo apartado 24 horas, a 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipPrivacyBanner(page);
    await page.route("**/api/locations**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA", city: "MEDELLÍN", department: "ANTIOQUIA", daneCode: "05001000", raw: { locationCode: "05001000", cityName: "MEDELLÍN", departmentName: "ANTIOQUIA" } }], count: 1 }),
      }),
    );
    await page.addInitScript(() => window.localStorage.removeItem("checkout-storage"));
    await page.goto(`/capsulas/${edition.segment}`);
    await expect(page.getByTestId("cupos-del-dia")).toContainText("Cupos de hoy: 4 de 5");
    await page.getByRole("button", { name: "Comprar pack de 5" }).click();
    await page.waitForURL(/\/finalizar-compra\?capsulas=1/);
    await fillContact(page);
    await fillDeliveryWithoutCarrier(page);
    await page.getByText("Transferencia bancaria", { exact: true }).click();
    const before = Date.now();
    await formButton(page, "Confirmar pedido").click();
    await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
    const transferId = new URL(page.url()).pathname.split("/").pop()!;

    const pending = await readOrderFromAdmin(SEEDED_STORE_ID, transferId);
    expect(pending.status).not.toBe("PAID");
    expect(Number(pending.total)).toBe(64500);
    expect(pending.capsule).toMatchObject({ packSize: 5, drawCompleted: false });
    const row = readCapsuleRow(transferId);
    expect(row).toMatchObject({ capsule: { videoConsent: "PRIVATE", provisionalCost: null }, slot: { status: "HELD", slotNumber: 2 } });
    const holdMs = new Date(row.slot.expiresAt).getTime() - before;
    expect(holdMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(holdMs).toBeLessThan(25 * 60 * 60 * 1000);
    await expect(page.getByRole("heading", { name: "Tus cápsulas sorpresa" })).toBeVisible({ timeout: 30_000 });
    await screenshot(page, "tienda-recibo-transferencia-390");

    await page.goto(`/capsulas/${edition.segment}`);
    await expect(page.getByTestId("cupos-del-dia")).toContainText("Cupos de hoy: 3 de 5");
  });

  for (const viewport of [
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`edición a la venta y recibo a ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await skipPrivacyBanner(page);
      await page.goto(`/capsulas/${edition.segment}`);
      await expect(page.getByRole("button", { name: /Comprar pack de/ })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await screenshot(page, `tienda-edicion-a-la-venta-${viewport.name}`);
      await page.goto(`/pedido/${orderId}`);
      await expect(page.getByRole("heading", { name: "Tus cápsulas sorpresa" })).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await screenshot(page, `tienda-recibo-capsulas-${viewport.name}`);
    });
  }
});
