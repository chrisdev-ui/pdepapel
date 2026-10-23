import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * «Métricas de redes» a 390, 768, 820, 1280 y 1440 px con una cuenta y publicaciones
 * sembradas en la base de pruebas: la pantalla lee solo la base (nada sale a
 * Meta ni a TikTok), una miniatura vencida cae al marcador neutro, la curva
 * abre e Inicio avisa la red que pide reconectar. Sin desbordes horizontales.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e:prod -- tests/e2e/social-metrics-viewports.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../output/screenshots/redes");
const HOUR = 3_600_000;

test.use({ trace: "off" });

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function signIn(page: Page, target: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Métricas de redes",
    redirectUrl: new URL(target, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("métricas de redes", () => {
  // Un solo juego de cuentas sembradas (único por tienda y red): con varios workers cada beforeAll chocaba.
  // En serie la primera prueba paga la compilación en frío del servidor de desarrollo.
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");
  const db = createTestPrismaClient("social-metrics");

  test.beforeAll(async () => {
    await db.socialTag.deleteMany({ where: { storeId } });
    await db.socialAccount.deleteMany({ where: { storeId } });
    const now = Date.now();
    const instagram = await db.socialAccount.create({
      data: { storeId, platform: "INSTAGRAM", externalId: "e2e-ig", username: "papeleria.pdepapel", tokenRef: "env:META_IG_PAGE_TOKEN", lastSyncAt: new Date(now - HOUR) },
    });
    await db.socialAccount.create({ data: { storeId, platform: "TIKTOK", externalId: "e2e-tt", username: "P de Papel", status: "NEEDS_RECONNECT", statusReason: "tiktok_invalid_grant" } });
    await db.socialAccountSnapshot.createMany({
      data: [
        { socialAccountId: instagram.id, capturedAt: new Date(now - 6 * 24 * HOUR), followers: 100 },
        { socialAccountId: instagram.id, capturedAt: new Date(now - HOUR), followers: 112 },
      ],
    });
    // Ocho publicaciones: el «× mediana» a la misma edad necesita 5 para comparar.
    const captions = ["Reel de agendas kawaii con stickers nuevos para la temporada", "Carrusel de cuadernos", "Reel de plumones pastel", "Publicación de bolígrafos", "Reel de washi", "Reel de stickers", "Reel de libretas", "Reel de colores"];
    for (const [index, caption] of Array.from(captions.entries())) {
      const postedAt = new Date(now - (index * 2 + 1) * 24 * HOUR);
      const post = await db.socialPost.create({
        data: {
          socialAccountId: instagram.id,
          platform: "INSTAGRAM",
          externalId: `e2e-m${index}`,
          productType: index === 1 ? "CAROUSEL" : index === 3 ? "FEED" : "REELS",
          caption,
          permalink: `https://www.instagram.com/p/e2e${index}`,
          // Una miniatura vencida (host que no resuelve) y otra sin miniatura: ambas caen al marcador.
          thumbnailUrl: index === 0 ? "https://cdn.invalid/vencida.jpg" : null,
          // El primer reel dura 30 s y la mayoría lo salta: lleva la alerta de retención.
          durationSec: index === 0 ? 30 : index === 2 ? 20 : null,
          postedAt,
        },
      });
      const base = index === 0 ? 900 : 100 + index * 20;
      await db.socialMetricSnapshot.createMany({
        data: [
          { socialPostId: post.id, capturedAt: new Date(postedAt.getTime() + 3 * HOUR), hoursSincePost: 3, views: Math.round(base / 3), reach: Math.round(base / 4), totalInteractions: 5 },
          {
            socialPostId: post.id,
            capturedAt: new Date(postedAt.getTime() + 24 * HOUR),
            hoursSincePost: 24,
            views: base,
            reach: Math.round(base * 0.8),
            totalInteractions: 20,
            saves: 4,
            shares: 2,
            ...(index === 0 ? { avgWatchTimeMs: 3000, skipRate: 62.4 } : index === 2 ? { avgWatchTimeMs: 9000, skipRate: 30 } : {}),
          },
        ],
      });
    }
  });

  test.afterAll(async () => {
    await db.socialTag.deleteMany({ where: { storeId } });
    await db.socialAccount.deleteMany({ where: { storeId } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "820", width: 820, height: 1180 },
    { name: "1280", width: 1280, height: 800 },
    { name: "1440", width: 1440, height: 900 },
  ]) {
    test(`a ${viewport.name} px`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.setViewportSize(viewport);
      await signIn(page, `/${storeId}/redes?dias=7`);
      const title = page.getByRole("heading", { level: 1, name: "Métricas de redes" });
      await expect(title).toBeVisible({ timeout: 60_000 });
      // La entrada de la pantalla (template.tsx) termina antes de la captura.
      await expect
        .poll(() => title.evaluate((node) => { for (let el: Element | null = node; el; el = el.parentElement) if (getComputedStyle(el).opacity !== "1") return false; return true; }))
        .toBe(true);

      await expect(page.getByRole("heading", { name: "Instagram", exact: true })).toBeVisible();
      await expect(page.getByText("@papeleria.pdepapel")).toBeVisible();
      // TikTok pide reconectar; en las e2e además sale «No configurada» (sin TIKTOK_ENABLED).
      await expect(page.getByText("La red rechazó el acceso guardado.", { exact: false })).toBeVisible();
      await expect(page.getByText("(+12)")).toBeVisible();
      // Seguidores por día: con 6 días de lecturas no hay cambio a 7 ni a 30 días todavía, y se dice por qué.
      await expect(page.getByRole("img", { name: /^Seguidores del/ })).toBeVisible();
      await expect(page.getByRole("definition").filter({ hasText: /^pocos datos$/ })).toHaveCount(2);
      await expect(page.getByText(/Se completa con las semanas: hay lecturas desde el/)).toBeVisible();
      await expect(page.getByText(/× la mediana de Instagram/)).toBeVisible();
      // «Qué funciona»: últimos 90 días, con titular o con la frase de por qué todavía no lo hay.
      const works = page.getByRole("region", { name: "Qué funciona en Instagram" });
      await expect(works).toBeVisible();
      await expect(works.getByText("Últimos 90 días · 8 publicaciones")).toBeVisible();
      await expect(works.getByRole("list", { name: "Etiquetas de Instagram" }).getByText("Reel", { exact: true })).toBeVisible();
      // Resumen semanal para WhatsApp: se copia; sin enlaces ni @menciones.
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Copiar resumen semanal" }).click();
      await expect(page.getByText("Resumen semanal copiado al portapapeles.").first()).toBeVisible();
      if (viewport.name === "1280") {
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toMatch(/^📊 \*Resumen de redes · /);
        expect(copied).toContain("*Instagram* · ");
        expect(copied).toContain("👉 *Para esta semana:* ");
        expect(copied).not.toMatch(/https?:|@/);
      }
      // Mejor horario: tabla día × franja con su leyenda en palabras.
      const bestTime = page.getByRole("region", { name: "Mejor horario en Instagram" });
      await expect(bestTime.getByRole("table", { name: /Mejor horario en Instagram/ })).toBeVisible();
      await expect(bestTime.getByRole("rowheader")).toHaveCount(7);
      await expect(bestTime.getByRole("list", { name: "Qué significa cada tono" })).toBeVisible();

      const list = viewport.width < 768 ? page.getByRole("list", { name: "Publicaciones" }) : page.locator("table");
      await expect(list.getByText("Carrusel de cuadernos")).toBeVisible();
      await expect(list.locator("img")).toHaveCount(0);
      // La alerta de retención: en la tabla un ícono con la frase y el porqué como nombre; en el celular, la frase.
      // Solo dos reels traen salto: sin mediana de la red, el 62,4 % no alerta; alerta el poco tiempo visto.
      if (viewport.width < 768) await expect(list.getByText(/La mayoría deja de verlo muy pronto\. Se ve en promedio el .+ del video\./)).toBeVisible();
      else {
        await expect(list.getByRole("img", { name: /^La mayoría deja de verlo muy pronto\. Se ve en promedio el .+ del video\.$/ })).toHaveCount(1);
        await expect(list.getByRole("columnheader", { name: "Salto 3 s" })).toBeVisible();
        await expect(list.getByRole("columnheader", { name: "% visto" })).toBeVisible();
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `redes-${viewport.name}.png`), fullPage: true });

      await list.getByText(/Reel de agendas kawaii/).click();
      const curveDialog = page.getByRole("dialog");
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("A las 24 h")).toBeVisible();
      await expect(dialog.getByText("Salto en 3 s")).toBeVisible();
      await expect(dialog.getByText("62,4 %")).toBeVisible();
      await expect(dialog.getByText("10 %", { exact: true })).toBeVisible();
      // El gráfico carga aparte; en frío el servidor de desarrollo tarda más de 5 s en compilarlo.
      await expect(dialog.locator(".recharts-line")).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByRole("button", { name: "Cerrar" })).toBeAttached();
      // Etiquetas: casillas reales; se guardan en la primera medida y las demás las encuentran marcadas.
      const formato = dialog.getByRole("group", { name: /^Formato/ });
      await expect(formato.getByRole("checkbox", { name: "pedido con nombre" })).toBeVisible();
      await expect(dialog.getByRole("group", { name: /^Gancho/ }).getByRole("checkbox", { name: "POV" })).toBeVisible();
      if (viewport.name === "390") {
        await formato.getByRole("checkbox", { name: "ASMR" }).check();
        await formato.getByRole("textbox", { name: "Agregar otra etiqueta de formato" }).fill("Unboxing");
        await formato.getByRole("button", { name: "Agregar" }).click();
        await expect(formato.getByRole("checkbox", { name: "Unboxing" })).toBeChecked();
        await dialog.getByRole("button", { name: "Guardar etiquetas" }).click();
        await expect(page.getByText("Etiquetas guardadas").first()).toBeVisible();
      } else {
        await expect(formato.getByRole("checkbox", { name: "ASMR" })).toBeChecked();
        await expect(formato.getByRole("checkbox", { name: "Unboxing" })).toBeChecked();
      }
      await expect(dialog).toHaveCSS("opacity", "1");
      await page.screenshot({ path: path.join(SHOTS, `redes-${viewport.name}-curva.png`) });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await curveDialog.press("Escape");

      // Inicio avisa mientras TikTok pide reconectar, con el enlace a esta pantalla.
      await page.goto(`/${storeId}`);
      const banner = page.getByRole("status").filter({ hasText: "Hay que reconectar TikTok" });
      await expect(banner).toBeVisible({ timeout: 60_000 });
      await expect(banner.getByRole("link", { name: "Ir a Métricas de redes" })).toHaveAttribute("href", `/${storeId}/redes`);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `inicio-reconectar-${viewport.name}.png`) });
    });
  }
});
