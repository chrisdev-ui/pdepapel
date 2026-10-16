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

const piece = (nombre: string, rol: "lento" | "se vende", precioEfectivo: number, categoria: string) => ({ nombre, rol, categoria, precioEfectivo, precioDeLista: precioEfectivo, oferta: null });
const datos: KitsAnswerData = {
  criterios: { diasSinVenta: 90, lineasSinFamilia: [], margenCriterioPanelPct: 35, precioMinimoPiezaLenta: 5000 },
  totalLentos: 4,
  plataQuietaACostoTotal: 102000,
  lentosSinCosto: 0,
  lentos: [
    { nombre: "Libreta de prueba", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" },
    { nombre: "Sobre de manila de prueba x unidad", disponible: 200, plataQuietaACosto: 30000, ultimaVenta: "hace 200 días" },
    { nombre: "Set de plumones de prueba doble punta pincel y fina 24 colores", disponible: 6, plataQuietaACosto: 30000, ultimaVenta: "hace 110 días" },
    { nombre: "Maleta conejito de prueba", disponible: 3, plataQuietaACosto: 18000, ultimaVenta: "hace 100 días" },
  ],
  nuevosSinDatosDeVenta: { cantidad: 3 },
  quietosDeBajoValor: { cantidad: 1, nombres: ["Sobre de manila de prueba x unidad"], productos: [{ nombre: "Sobre de manila de prueba x unidad", precioEfectivo: 300, motivo: "precio unitario bajo" }] },
  kits: [
    {
      nombreSugerido: "Kit Libretas Kawaii",
      ocasion: "Grados",
      n: 1,
      piezas: [
        piece("Libreta de prueba", "lento", 9000, "Libretas"),
        { nombre: "Lápiz de prueba con un nombre largo para partir el renglón", rol: "se vende", categoria: "Lápices", precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" },
        { ...piece("Borrador de prueba", "se vende", 3000, "Borradores"), comparteStockCon: ["Kit Plumones Primavera"] },
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
    {
      nombreSugerido: "Kit Plumones Primavera",
      ocasion: "Útiles escolares",
      n: 2,
      piezas: [
        piece("Set de plumones de prueba doble punta pincel y fina 24 colores", "lento", 25000, "Plumones"),
        piece("Cuaderno de prueba", "se vende", 6000, "Cuadernos"),
        { ...piece("Borrador de prueba", "se vende", 3000, "Borradores"), comparteStockCon: ["Kit Libretas Kawaii"] },
      ],
      kitsArmables: 3,
      sumaPreciosEfectivos: 34000,
      precioSugerido: 29900,
      ahorroPct: 12.1,
      margenPct: 28,
      margenBajo: true,
      estado: "listo",
      señales: ["Set de plumones de prueba: 110 días sin venderse, $30.000 quietos a costo"],
    },
    {
      nombreSugerido: "Kit Regalo Snoopy",
      ocasion: "Regalo",
      n: 3,
      piezas: [piece("Maleta conejito de prueba", "lento", 30000, "Maletas"), piece("Libreta pequeña de prueba", "se vende", 7000, "Libretas"), piece("Stickers de prueba", "se vende", 4000, "Stickers")],
      kitsArmables: 3,
      sumaPreciosEfectivos: 41000,
      precioSugerido: 35900,
      ahorroPct: 12.4,
      margenPct: 40,
      margenBajo: false,
      estado: "listo",
      señales: ["Maleta conejito de prueba: 100 días sin venderse, $18.000 quietos a costo"],
    },
  ],
  pocoAtractivos: [],
  sinKit: [],
};

// El primer kit con los textos que el modelo manda a textosDeKits; los otros dos sin textos (la respuesta real del 2026-10-16): texto base.
const answer = composeKitsAnswer(datos, {
  kits: [{ n: 1, nombreCorto: "Kit de grados", loQueAmaras: ["Una libreta para tus ideas", "Útiles para el día a día"], idealPara: "regalar a quien se gradúa" }],
});

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

      for (const name of ["Resumen", "Los 4 con más plata quieta", "3 kits sugeridos", "🎓 Kit de grados", "✏️ Kit Plumones Primavera", "🎁 Kit Regalo Snoopy", "Notas"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
      }
      await expect(page.getByText("alcanza para 4 kits")).toBeVisible();
      await expect(page.locator('[data-tag="margen bajo (meta 35 %)"]')).toHaveCount(2);
      await expect(page.locator('[data-tag="no va en kits"]')).toHaveCount(1);
      await expect(page.getByText("su precio por unidad es muy bajo ($300; una pieza quieta debe valer al menos $5.000)")).toBeVisible();
      // Las piezas son una lista de verdad, cada una con su etiqueta, y lo que comparte stock cuelga de su pieza.
      const pieces = page.locator('ul[data-list-depth="0"]', { hasText: "Libreta de prueba · $9.000" }).locator(':scope > li[data-bullet-depth="0"]');
      await expect(pieces).toHaveCount(3);
      await expect(pieces.nth(0).locator('[data-tag="quieto"]')).toBeVisible();
      await expect(pieces.nth(1).locator('[data-tag="se vende"]')).toBeVisible();
      await expect(pieces.nth(2).locator('li[data-bullet-depth="1"]')).toHaveText("comparte stock con «Kit Plumones Primavera»");
      // Cada kit con su texto para la ficha, plegado, con «Copiar» a la vista; sin texto del modelo, uno base con sus piezas.
      const why = page.getByTestId("details-block").first();
      const copies = page.getByTestId("copy-block");
      await expect(copies).toHaveCount(3);
      await expect(copies.nth(0).locator("summary")).toContainText("Texto para la ficha");
      await expect(copies.nth(1).locator("summary")).toContainText("Texto para la ficha (base)");
      await expect(copies.nth(2).locator("summary")).toContainText("Texto para la ficha (base)");
      for (let index = 0; index < 3; index += 1) {
        await expect(copies.nth(index)).not.toHaveAttribute("open", "");
        await expect(copies.nth(index).getByRole("button", { name: "Copiar" })).toBeVisible();
      }
      const copy = copies.nth(0);
      await expect(why).not.toHaveAttribute("open", "");
      await expect(page.getByText("120 días sin venderse, $24.000 quietos a costo")).toBeHidden();
      // Sin jerga, nombres de herramientas, marcadores ni «:::», ni la nota del modelo.
      const shown = await page.getByTestId("answer").innerText();
      expect(shown).not.toMatch(/kitsParaRotar|textosDeKits|precio efectivo|suma de precios|\((lento|se vende)\)|:::|\[\[KIT/i);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // «Copiar» va dentro del título del bloque: copia sin desplegarlo.
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await copy.getByRole("button", { name: "Copiar" }).click();
      await expect(page.getByText("Texto copiado").first()).toBeVisible();
      await expect(copy).not.toHaveAttribute("open", "");
      await page.getByRole("heading", { name: "🎓 Kit de grados" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-kits.png`), fullPage: true });

      await why.locator("summary").click();
      for (let index = 0; index < 3; index += 1) await copies.nth(index).locator("summary > span").click();
      await expect(page.getByText("120 días sin venderse, $24.000 quietos a costo")).toBeVisible();
      await expect(copy.getByText("✨ Lo que amarás")).toBeVisible();
      await expect(copies.nth(1)).toContainText("Plumones, cuadernos y borradores en un solo kit");
      await expect(copies.nth(1).locator("li")).toContainText(["Set de plumones de prueba doble punta pincel y fina 24 colores", "Cuaderno de prueba", "Borrador de prueba"]);
      await expect(copies.nth(2)).toContainText("Ideal para regalar a alguien especial");
      await expect(copies.nth(2)).not.toContainText("Plumones");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-kits-abierto.png`), fullPage: true });
    });
  }
});
