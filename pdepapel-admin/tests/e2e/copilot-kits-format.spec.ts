import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { composeKitsAnswer, type KitsAnswerData } from "../../lib/copiloto/skills/kits-answer";

import { expect, test } from "./helpers/image-stub";

/**
 * La respuesta de kits tal como la arma el código (composeKitsAnswer), en el
 * renderizador real del copiloto, a 360 y 390 px: secciones, línea clave,
 * piezas con su etiqueta, «Por qué» y el texto para la ficha plegados, y sin
 * desbordar. La respuesta del modelo es simulada (no se llama a OpenAI).
 *
 *   npm run test:e2e:seed-admin
 *   COPILOT_DATABASE_URL=mysql://copilot_ro@127.0.0.1/pdepapel_test \
 *     npm run test:e2e -- tests/e2e/copilot-kits-format.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId && process.env.COPILOT_DATABASE_URL);
const SHOTS = path.resolve(__dirname, "../../tmp/copilot-shots");

const datos: KitsAnswerData = {
  criterios: { diasSinVenta: 90, lineasSinFamilia: [] },
  totalLentos: 2,
  plataQuietaACostoTotal: 42000,
  lentosSinCosto: 0,
  lentos: [
    { nombre: "Libreta de prueba", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" },
    { nombre: "Carpeta de prueba", disponible: 6, plataQuietaACosto: 18000, ultimaVenta: "hace 100 días" },
  ],
  nuevosSinDatosDeVenta: { cantidad: 3 },
  quietosDeBajoValor: { cantidad: 0 },
  kits: [
    {
      nombreSugerido: "Kit Grados con Libreta de prueba",
      ocasion: "grados",
      marcador: "[[KIT-1]]",
      piezas: [
        { nombre: "Libreta de prueba", rol: "lento", precioEfectivo: 9000, precioDeLista: 9000, oferta: null },
        { nombre: "Lápiz de prueba con un nombre largo para partir el renglón", rol: "se vende", precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" },
        { nombre: "Borrador de prueba", rol: "se vende", precioEfectivo: 3000, precioDeLista: 3000, oferta: null, comparteStockCon: ["Kit de carpetas"] },
      ],
      kitsArmables: 4,
      sumaPreciosEfectivos: 16000,
      precioSugerido: 13900,
      ahorroPct: 13.1,
      margenPct: 30,
      margenBajo: true,
      estado: "listo",
      señales: [
        "Libreta de prueba: 120 días sin venderse, $24.000 quietos a costo",
        "Lápiz de prueba: su línea se compra junto con la de Libreta de prueba (3 pedidos en 180 días); en alza (6 en 30 días contra 1 antes)",
      ],
    },
  ],
  pocoAtractivos: [],
  sinKit: [],
};

const answer = composeKitsAnswer(
  datos,
  ["[[KIT-1]] Kit de grados", "✨ Lo que amarás", "- Una libreta para tus ideas", "- Útiles para el día a día", "📦 Incluye: Libreta, Lápiz y Borrador de prueba", "🎁 Ideal para regalar a quien se gradúa."].join("\n"),
);

const sse = [
  { type: "start", messageId: "cop-e2e-kits" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: answer },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish" },
]
  .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  .join("") + "data: [DONE]\n\n";

test.use({ trace: "off" });

test.describe("respuesta de kits en el teléfono", () => {
  test.skip(!configured, "Define claves de prueba de Clerk, E2E_ADMIN_CLERK_USER_ID y COPILOT_DATABASE_URL.");

  for (const viewport of [
    { name: "telefono-360", width: 360, height: 780 },
    { name: "telefono-390", width: 390, height: 844 },
  ]) {
    test(`secciones, piezas anidadas y bloques plegados, sin desbordar a ${viewport.width} px`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Formato de la respuesta de kits en el teléfono",
        redirectUrl: new URL(`/${storeId}/copiloto?desde=inicio`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.route("**/copiloto/chat", (route) =>
        route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" }, body: sse }),
      );

      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`/${storeId}/copiloto`));
      const box = page.getByRole("textbox", { name: "Tu pregunta" });
      await expect(async () => {
        // Vaciar antes: si el primer intento llegó antes de hidratar, repetir el mismo texto no dispara onChange.
        await box.fill("");
        await box.fill("¿Qué kits puedo armar?");
        await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await page.getByRole("button", { name: "Enviar" }).click();

      for (const name of ["Resumen", "Los 2 con más plata quieta", "1 kit sugerido", "🎓 Kit de grados", "Notas"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
      }
      await expect(page.getByText("alcanza para 4 kits")).toBeVisible();
      await expect(page.locator('[data-tag="margen bajo"]')).toBeVisible();
      // Las piezas son una lista de verdad, cada una con su etiqueta, y lo que comparte stock cuelga de su pieza.
      const pieces = page.locator('ul[data-list-depth="0"]', { hasText: "Libreta de prueba · $9.000" }).locator(':scope > li[data-bullet-depth="0"]');
      await expect(pieces).toHaveCount(3);
      await expect(pieces.nth(0).locator('[data-tag="quieto"]')).toBeVisible();
      await expect(pieces.nth(1).locator('[data-tag="se vende"]')).toBeVisible();
      await expect(pieces.nth(2).locator('li[data-bullet-depth="1"]')).toHaveText("comparte stock con «Kit de carpetas»");
      // Plegados por defecto: «Por qué» y el texto para la ficha, con «Copiar» a la vista.
      const why = page.getByTestId("details-block");
      const copy = page.getByTestId("copy-block");
      await expect(why).not.toHaveAttribute("open", "");
      await expect(copy).not.toHaveAttribute("open", "");
      await expect(copy.getByRole("button", { name: "Copiar" })).toBeVisible();
      await expect(page.getByText("120 días sin venderse, $24.000 quietos a costo")).toBeHidden();
      // Sin jerga ni nombres de herramientas.
      const shown = await page.getByTestId("answer").innerText();
      expect(shown).not.toMatch(/kitsParaRotar|precio efectivo|suma de precios|\((lento|se vende)\)/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.getByRole("heading", { name: "🎓 Kit de grados" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-kits.png`), fullPage: true });

      await why.locator("summary").click();
      await copy.locator("summary").getByText("Texto para la ficha").click();
      await expect(page.getByText("120 días sin venderse, $24.000 quietos a costo")).toBeVisible();
      await expect(copy.getByText("✨ Lo que amarás")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-kits-abierto.png`), fullPage: true });
    });
  }
});
