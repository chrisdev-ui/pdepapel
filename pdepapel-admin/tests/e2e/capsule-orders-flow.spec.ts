import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { TEST_ENV_STUBS } from "../../scripts/lib/test-isolation.mjs";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Un pedido de cápsulas en el panel, contra el servidor aislado (venta
 * encendida solo en pruebas, EnvioClick fuera de alcance): la dueña lo
 * registra (pack de 10, cupo apartado), Bold lo paga por su webhook firmado
 * (cupo confirmado, costo provisional), en «Sacar cápsulas» se ven los cupos
 * de hoy, se abre desde el pedido, se escanean los 10 papeles y el regalo y se
 * cierra: la guía se intenta sola (y, sin EnvioClick, deja el motivo en el
 * envío). La tarjeta del pedido a 390, 768 y 1280.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/capsule-orders-flow.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../output/screenshots/capsulas-p4");
// El servidor aislado firma con el valor de prueba, nunca con la clave del entorno.
const BOLD_SECRET = TEST_ENV_STUBS.BOLD_SECRET_KEY;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let edition: { segment: string; productId: string };
let orderId: string;

const seed = (...args: string[]) =>
  execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-capsule-edition.ts", ...args], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  })
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{")) ?? "";

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba del pedido de cápsulas",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

async function payWithBold(orderNumber: string, total: number) {
  const body = JSON.stringify({ type: "SALE_APPROVED", data: { payment_id: `e2e-${orderNumber}`, metadata: { reference: orderNumber }, amount: { total, currency: "COP" } } });
  const signature = crypto.createHmac("sha256", BOLD_SECRET).update(Buffer.from(body, "utf8").toString("base64")).digest("hex");
  const response = await fetch(new URL(`/api/webhook/bold?store=${storeId}`, baseURL), { method: "POST", headers: { "content-type": "application/json", "x-bold-signature": signature }, body });
  return response.status;
}

test.describe("pedido de cápsulas en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(() => {
    db = createTestPrismaClient("capsule-orders-flow");
    edition = JSON.parse(seed("seed-live"));
  });
  test.afterAll(async () => {
    seed("clean");
    await db?.$disconnect();
  });

  test("registrar, pagar, sacar, cerrar y la guía en camino", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, `/${storeId}/productos/ediciones/sacar`);
    await expect(page.getByTestId("cupos-de-hoy")).toContainText("Cupos de hoy: 0 de 5", { timeout: 90_000 });

    // La dueña registra el pedido (sin pagar): toma un cupo apartado.
    const created = await page.request.post(new URL(`/api/${storeId}/orders`, baseURL).toString(), {
      data: {
        fullName: "Mariana Gómez",
        phone: "3001234567",
        email: "mariana@ejemplo.test",
        address: "Calle 10 # 20-30",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        status: "PENDING",
        orderItems: [{ productId: edition.productId, quantity: 10 }],
        payment: { method: "Bold" },
        capsuleVideoConsent: "PUBLIC_FIRST_NAME",
      },
    });
    expect(created.status()).toBe(200);
    const order = (await created.json()) as { id: string; orderNumber: string; total: number };
    orderId = order.id;
    expect(order.total).toBe(124900);
    await expect(db.capsuleDailySlot.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({ status: "HELD" });

    // Bold confirma: cupo confirmado y costo provisional congelado.
    expect(await payWithBold(order.orderNumber, order.total)).toBe(200);
    await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
    await expect(db.capsuleDailySlot.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(db.capsuleOrder.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({ provisionalCost: 42000, videoConsent: "PUBLIC_FIRST_NAME" });
    // Con tarifa de EnvioClick, para que al cerrar se intente la guía.
    await db.shipping.upsert({ where: { orderId }, create: { orderId, storeId, provider: "ENVIOCLICK", envioClickIdRate: 777, cost: 0, status: "Preparing" }, update: { provider: "ENVIOCLICK", envioClickIdRate: 777 } });

    // Desde el pedido, «Abrir en Sacar cápsulas».
    await page.goto(new URL(`/${storeId}/pedidos/${orderId}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("capsula-del-pedido");
    await expect(card).toContainText("Por sacar", { timeout: 60_000 });
    await expect(card).toContainText("provisional");
    await card.getByRole("link", { name: "Abrir en «Sacar cápsulas»" }).click();
    await expect(page.getByTestId("cupos-de-hoy")).toContainText("Cupos de hoy: 1 de 5", { timeout: 60_000 });

    const capsuleOrder = await db.capsuleOrder.findUniqueOrThrow({ where: { orderId } });
    const slips = await db.capsuleSlip.findMany({ where: { editionId: capsuleOrder.editionId, kind: "SLIP", status: "PRINTED" }, orderBy: { code: "asc" }, take: 10 });
    const codeField = page.getByRole("textbox", { name: "Código del papel" });
    await expect(codeField).toBeVisible({ timeout: 30_000 });
    for (let index = 0; index < slips.length; index += 1) {
      const slip = slips[index];
      await codeField.fill(slip.code);
      await codeField.press("Enter");
      await expect(page.getByText(`${index + 1} de 10`, { exact: true })).toBeVisible({ timeout: 30_000 });
    }
    // El regalo también se escanea: con los papeles completos el campo sigue abierto para su QR.
    const gift = await db.capsuleSlip.findFirstOrThrow({ where: { editionId: capsuleOrder.editionId, kind: "GIFT", status: "PRINTED" } });
    await codeField.fill(gift.code);
    await codeField.press("Enter");
    await expect(page.getByRole("button", { name: "Cerrar sorteo" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Cerrar sorteo" }).click();
    await expect(page.getByText(/La guía de EnvioClick se está creando/).first()).toBeVisible({ timeout: 30_000 });
    await expect(db.capsuleOrder.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({ costStatus: "REAL" });
    // EnvioClick está fuera de alcance en las pruebas: el intento queda con su motivo en el envío.
    await expect.poll(async () => (await db.shipping.findUniqueOrThrow({ where: { orderId } })).guideAttemptedAt, { timeout: 60_000 }).not.toBeNull();
    const shipping = await db.shipping.findUniqueOrThrow({ where: { orderId } });
    expect(shipping.envioClickIdOrder).toBeNull();
    expect(shipping.guideError).toMatch(/sorteo de cápsulas cerrado/);
    await page.screenshot({ path: path.join(SHOTS, "panel-sacar-cerrado-1280.png"), fullPage: true });
  });

  test("transferencia: aparte de «Por sacar» hasta que Paula la marca pagada", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/productos/ediciones/sacar`);
    await expect(page.getByTestId("cupos-de-hoy")).toBeVisible({ timeout: 90_000 });
    const created = await page.request.post(new URL(`/api/${storeId}/orders`, baseURL).toString(), {
      data: {
        fullName: "Laura Pineda",
        phone: "3001234567",
        email: "laura@ejemplo.test",
        address: "Calle 10 # 20-30",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        status: "PENDING",
        orderItems: [{ productId: edition.productId, quantity: 5 }],
        payment: { method: "BankTransfer" },
      },
    });
    expect(created.status()).toBe(200);
    const order = (await created.json()) as { id: string; orderNumber: string };
    const slot = await db.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(slot.status).toBe("HELD");
    expect(slot.expiresAt!.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);

    await page.reload({ waitUntil: "domcontentloaded" });
    const pending = page.getByTestId("transferencias-por-verificar");
    await expect(pending).toContainText(order.orderNumber, { timeout: 60_000 });
    await expect(pending).toContainText("cupo apartado hasta");
    await expect(page.getByRole("button", { name: /Laura · pack de 5/ })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "panel-transferencia-por-verificar-390.png"), fullPage: true });

    // Paula verifica el comprobante y la marca pagada: cupo confirmado y a «Por sacar».
    const paid = await page.request.patch(new URL(`/api/${storeId}/orders/${order.id}`, baseURL).toString(), { data: { status: "PAID", expectedStatus: "PENDING" } });
    expect(paid.status()).toBe(200);
    await expect(db.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ status: "CONFIRMED" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Laura · pack de 5/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("transferencias-por-verificar")).toHaveCount(0);
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "tableta-768", width: 768, height: 1024 },
    { name: "computador-1280", width: 1280, height: 800 },
  ]) {
    test(`la tarjeta del pedido en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, `/${storeId}/pedidos/${orderId}`);
      const card = page.getByTestId("capsula-del-pedido");
      await expect(card).toContainText("Sorteo cerrado", { timeout: 90_000 });
      await expect(card).toContainText("Llavero gatito (regalo)");
      await expect(card).toContainText("Se puede publicar con su primer nombre");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `panel-pedido-capsulas-${viewport.name}.png`), fullPage: true });
    });
  }
});
