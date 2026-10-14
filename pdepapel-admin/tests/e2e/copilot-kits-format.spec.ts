import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";

import { kitDetail, type KitDraft } from "../../lib/copiloto/kits-rotation";

import { expect, test } from "./helpers/image-stub";

/**
 * Una respuesta de kits en el renderizador real del copiloto, en el teléfono:
 * las líneas de cada pieza quedan como viñetas dentro del kit, no al mismo
 * nivel que su nombre. La respuesta del modelo es simulada (no se llama a
 * OpenAI) y el detalle sale del mismo `kitDetail` que usa la herramienta.
 *
 *   npm run test:e2e:seed-admin
 *   COPILOT_DATABASE_URL=mysql://copilot_ro@127.0.0.1/pdepapel_test \
 *     node scripts/with-e2e-env.mjs npx playwright test tests/e2e/copilot-kits-format.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId && process.env.COPILOT_DATABASE_URL);
const SHOTS = path.resolve(__dirname, "../../tmp/copilot-shots");

const draft: KitDraft = {
  nombreSugerido: "Kit escolar con Libreta de prueba",
  ocasion: null,
  piezas: [
    { productId: "a", nombre: "Libreta de prueba", rol: "lento", disponible: 8, precioEfectivo: 9000, precioDeLista: 9000, oferta: null, costo: 3000 },
    { productId: "b", nombre: "Lápiz de prueba", rol: "se vende", disponible: 20, precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %", costo: 1500 },
    { productId: "c", nombre: "Borrador de prueba", rol: "se vende", disponible: 9, precioEfectivo: 3000, precioDeLista: 3000, oferta: null, costo: 800, comparteStockCon: ["Kit de carpetas"] },
  ],
  kitsArmables: 4,
  sumaPreciosEfectivos: 16000,
  costoTotal: 5300,
  precioMinimo: 6360,
  precioSugerido: 13900,
  ahorroParaLaClienta: 2100,
  ahorroPct: 13.1,
  descuentoObjetivoPct: 12,
  margenPct: 61.9,
  sinCostoDe: [],
  estado: "listo",
  señales: [
    "Libreta de prueba: 120 días sin venderse, $24.000 quietos a costo",
    "Lápiz de prueba: su línea se compra junto con la de Libreta de prueba (3 pedidos en 180 días); en alza (6 en 30 días contra 1 antes)",
    "Borrador de prueba: su línea se compra junto con la de Libreta de prueba (3 pedidos en 180 días)",
  ],
};

const answer = [
  "Hay **2 productos** sin ventas en 90 días.",
  "",
  `- **${draft.nombreSugerido}** — útiles escolares`,
  kitDetail(draft),
  "",
  "Son borradores: créalos en Productos › Kit si te sirven.",
].join("\n");

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

  test("las piezas quedan como viñetas dentro del kit, sin desbordar a 390 px", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
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
      await box.fill("¿Qué kits puedo armar?");
      await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 60_000 });
    await page.getByRole("button", { name: "Enviar" }).click();

    // El copiloto pinta texto con viñetas por sangría (no HTML de markdown): el kit en nivel 0 y sus piezas en nivel 1.
    const kitLine = page.locator('[data-bullet-depth="0"]', { hasText: draft.nombreSugerido });
    await expect(kitLine).toBeVisible();
    for (const piece of draft.piezas) {
      await expect(page.locator('[data-bullet-depth="1"]', { hasText: `${piece.nombre} (${piece.rol})` })).toBeVisible();
    }
    await expect(page.locator('[data-bullet-depth="1"]', { hasText: "comparte stock con «Kit de carpetas»" })).toBeVisible();
    await expect(page.locator('[data-bullet-depth="1"]', { hasText: "Por qué:" })).toBeVisible();
    // Sangría colgante: una pieza que se parte en dos renglones sigue a la derecha de la viñeta del kit.
    const geometry = await page.evaluate(() => {
      const left = (node: Element) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).map((rect) => Math.round(rect.left));
      };
      const kit = document.querySelector('[data-bullet-depth="0"]')!;
      const lines = Array.from(document.querySelectorAll('[data-bullet-depth="1"]')).filter((node) => /\((lento|se vende)\):/.test(node.textContent ?? ""));
      return { kit: Math.min(...left(kit)), pieces: lines.map((node) => Math.min(...left(node))) };
    });
    expect(geometry.pieces).toHaveLength(3);
    expect(geometry.pieces.every((x) => x > geometry.kit)).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await kitLine.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, "telefono-390-kits.png"), fullPage: true });
  });
});
