import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { expect, test } from "./helpers/image-stub";

/**
 * El copiloto en el teléfono y en el computador, con la respuesta del modelo
 * simulada (no se llama a OpenAI). Corre con el panel de pruebas:
 *
 *   npm run test:e2e:seed-admin
 *   COPILOT_DATABASE_URL=mysql://copilot_ro@127.0.0.1/pdepapel_test \
 *     node scripts/with-e2e-env.mjs npx playwright test tests/e2e/copilot-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId && process.env.COPILOT_DATABASE_URL);
const SHOTS = path.resolve(__dirname, "../../tmp/copilot-shots");

const sse = [
  { type: "start", messageId: "cop-e2e-1" },
  { type: "start-step" },
  { type: "tool-input-start", toolCallId: "c1", toolName: "resumenDeHoy" },
  { type: "tool-input-available", toolCallId: "c1", toolName: "resumenDeHoy", input: {} },
  { type: "tool-output-available", toolCallId: "c1", output: { fuente: "resumenDeHoy", rango: "2026-10-10", actualizadoEl: "2026-10-10T19:00:00.000Z", datos: {}, truncado: false } },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Según el resumen de hoy llevas **$45.000** en ventas por tienda. " },
  { type: "text-delta", id: "t1", delta: "Para tela usa marcador acrílico [conocimiento: marcadores-acrilicos]." },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish" },
]
  .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  .join("") + "data: [DONE]\n\n";

test.use({ trace: "off" });

test.describe("copiloto en distintos tamaños", () => {
  test.skip(!configured, "Define claves de prueba de Clerk, E2E_ADMIN_CLERK_USER_ID y COPILOT_DATABASE_URL.");

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844 },
    { name: "computador-1440", width: 1440, height: 900 },
  ]) {
    test(`chat y conocimiento en ${viewport.name}`, async ({ page }) => {
      // El servidor de desarrollo compila cada página la primera vez.
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Prueba del copiloto en distintos tamaños",
        redirectUrl: new URL(`/${storeId}/copiloto?desde=inicio`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.route("**/copiloto/chat", (route) =>
        route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" }, body: sse }),
      );

      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/${storeId}/copiloto`));
      await expect(page.getByRole("heading", { name: "Copiloto" })).toBeVisible();
      await expect(page.getByRole("button", { name: "¿Cómo voy hoy?" })).toBeVisible();

      // Hasta que React hidrata, un clic no hace nada: escribir habilita «Enviar».
      const box = page.getByRole("textbox", { name: "Tu pregunta" });
      await expect(async () => {
        await box.fill("hola");
        await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await box.fill("");
      await page.getByRole("button", { name: "¿Cómo voy hoy?" }).click();
      await expect(page.getByText("Según el resumen de hoy llevas")).toBeVisible();
      await expect(page.locator("strong", { hasText: "$45.000" })).toBeVisible();
      await expect(page.getByRole("link", { name: "nota: marcadores-acrilicos" })).toBeVisible();
      await expect(page.getByText(/Datos: .*2026-10-10/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Ver más" })).toBeVisible();
      // La caja de la pregunta y el botón se ven sin desplazar la página.
      await expect(page.getByRole("textbox", { name: "Tu pregunta" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Enviar" })).toBeInViewport({ ratio: 1 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-chat.png`) });

      await page.goto(`/${storeId}/copiloto/conocimiento`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Conocimiento del copiloto" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Marcadores a base de alcohol" })).toBeVisible();
      await expect(page.getByText("Pendiente de Paula").first()).toBeVisible();
      // Esperar a que la página responda (y termine su entrada con opacidad):
      // «Corregir» abre el editor de la nota solo cuando React ya hidrató.
      const firstNote = page.locator("li").filter({ has: page.getByRole("heading", { name: "Adhesivos para manualidades" }) });
      await expect(async () => {
        await firstNote.getByRole("button", { name: "Corregir" }).click();
        await expect(firstNote.getByLabel("Texto de la nota")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await firstNote.getByRole("button", { name: "Cancelar" }).click();
      await expect(firstNote.getByRole("button", { name: "Aprobar" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector("main > div > div") as Element).opacity)).toBe("1");
      const overflowKnowledge = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflowKnowledge).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-conocimiento.png`) });
    });
  }
});
