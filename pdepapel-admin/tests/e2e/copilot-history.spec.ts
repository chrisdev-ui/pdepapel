import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { expect, test } from "./helpers/image-stub";

/**
 * Historial del copiloto: un solo clic (o Enter) abre una conversación, y
 * «Eliminar» la borra tras confirmar. Necesita dos conversaciones guardadas
 * de la usuaria de prueba en la base local (ver la receta en AGENTS.md).
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId && process.env.COPILOT_DATABASE_URL);
const SHOTS = path.resolve(__dirname, "../../tmp/copilot-shots");

test.use({ trace: "off" });

async function signIn(page: import("@playwright/test").Page) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Historial del copiloto",
    redirectUrl: new URL(`/${storeId}/copiloto`, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Copiloto" })).toBeVisible({ timeout: 60_000 });
  // Hasta que React hidrata, un clic no hace nada.
  const box = page.getByRole("textbox", { name: "Tu pregunta" });
  await expect(async () => {
    await box.fill("hola");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  await box.fill("");
}

test.describe("historial del copiloto", () => {
  test.skip(!configured, "Define claves de prueba de Clerk, E2E_ADMIN_CLERK_USER_ID y COPILOT_DATABASE_URL.");
  test.describe.configure({ mode: "serial" });

  test("computador: un clic abre, Enter abre la otra, y eliminar vuelve a un chat vacío", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    await page.getByRole("button", { name: "Ventas de ayer", exact: true }).click();
    // Un solo clic; el tope largo es por la primera compilación de la ruta en desarrollo.
    await expect(page.getByText("Respuesta guardada 1")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Ideas de regalo", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Respuesta guardada 2")).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "historial-1440.png") });

    await page.getByRole("button", { name: "Eliminar la conversación «Ideas de regalo»" }).click();
    await expect(page.getByText("¿Eliminar esta conversación?")).toBeVisible();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ideas de regalo", exact: true })).toHaveCount(0);
    await expect(page.getByText("Respuesta guardada 2")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "¿Cómo voy hoy?" })).toBeVisible();
  });

  test("teléfono: elegir en la lista abre la conversación y el botón de basura la elimina", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    await page.getByLabel("Conversaciones anteriores").selectOption({ label: "Ventas de ayer" });
    await expect(page.getByText("Respuesta guardada 1")).toBeVisible({ timeout: 30_000 });
    const trash = page.getByRole("button", { name: "Eliminar la conversación «Ventas de ayer»" }).first();
    await expect(trash).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "historial-390.png") });
    await trash.click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByText("Respuesta guardada 1")).toHaveCount(0);
  });
});
