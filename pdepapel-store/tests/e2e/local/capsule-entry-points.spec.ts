import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "../helpers/safe-test";
import { skipPrivacyBanner } from "../helpers/public-page";
import { purgeStoreCapsules } from "./helpers/local-environment";

/**
 * Con la venta encendida, las entradas a las cápsulas: sin edición a la venta
 * no hay menú ni banner y /capsulas es «Entre ediciones» (indexable); con una
 * edición LIVE, «Cápsulas» en el encabezado (1280) y en el cajón (390/768), el
 * banner del inicio, /capsulas redirige con los utm_* y la página de la
 * edición se indexa y trae «Cómo funciona y condiciones».
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "output/screenshots/capsulas-lanzamiento");

function admin(mode: "seed" | "seed-live" | "clean") {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-capsule-edition.ts", mode], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  return output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "";
}

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const shot = async (page: Page, name: string, fullPage = true) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage });
};

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: /menú|categorías/i }).first().click();
  return page.getByRole("dialog");
}

test.describe("cápsulas: entradas en la tienda", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    admin("clean");
    await purgeStoreCapsules();
  });

  test.describe("sin edición a la venta", () => {
    test.beforeAll(async () => {
      admin("seed");
      await purgeStoreCapsules();
    });

    for (const viewport of VIEWPORTS) {
      test(`a ${viewport.width}: ni menú ni banner; /capsulas es «Entre ediciones»`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await skipPrivacyBanner(page);
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 2, name: "Escritorio" })).toHaveCount(0);
        await expect(page.locator("header").getByRole("link", { name: "Cápsulas", exact: true })).toHaveCount(0);
        if (viewport.width < 1024) {
          const drawer = await openDrawer(page);
          await expect(drawer.getByRole("link", { name: "Ofertas" })).toBeVisible();
          await expect(drawer.getByRole("link", { name: "Cápsulas" })).toHaveCount(0);
          await page.keyboard.press("Escape");
        }

        const response = await page.goto("/capsulas");
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: "Entre ediciones" })).toBeVisible();
        const main = page.locator("main");
        for (const [label, href] of [
          ["Instagram", "https://instagram.com/papeleria.pdepapel"],
          ["TikTok", "https://tiktok.com/@papeleria.pdepapel"],
          ["Facebook", "https://www.facebook.com/papeleriapdepapel/"],
          ["YouTube", "https://www.youtube.com/@papeleriapdepapel"],
        ]) {
          const link = main.getByRole("link", { name: `${label} de P de Papel` });
          await expect(link).toHaveAttribute("href", href);
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/capsulas$/);
        await noHorizontalScroll(page);
        await shot(page, `entre-ediciones-${viewport.name}`);
      });
    }
  });

  test.describe("con una edición a la venta", () => {
    let edition: { segment: string };
    test.beforeAll(async () => {
      edition = JSON.parse(admin("seed-live"));
      await purgeStoreCapsules();
    });

    for (const viewport of VIEWPORTS) {
      test(`a ${viewport.width}: menú, banner, /capsulas y condiciones`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.setViewportSize(viewport);
        await skipPrivacyBanner(page);
        await page.goto("/");

        const banner = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Escritorio" }) });
        await expect(banner).toBeVisible();
        await expect(banner).toContainText("Pack de 5 por");
        await expect(banner).not.toContainText(/cupo/i);
        await banner.scrollIntoViewIfNeeded();
        await banner.screenshot({ path: path.join(SCREENSHOTS, `banner-inicio-${viewport.name}.png`) });

        if (viewport.width >= 1024) {
          const link = page.locator("header").getByRole("link", { name: "Cápsulas", exact: true });
          await expect(link).toBeVisible();
          // La fila de categorías no se parte con el enlace nuevo.
          const row = link.locator("xpath=ancestor::div[1]");
          expect((await row.boundingBox())!.height).toBeLessThanOrEqual(52);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.locator("header").screenshot({ path: path.join(SCREENSHOTS, `menu-${viewport.name}.png`) });
          await link.click();
        } else {
          const drawer = await openDrawer(page);
          const link = drawer.getByRole("link", { name: "Cápsulas" });
          await expect(link).toBeVisible();
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          await shot(page, `menu-${viewport.name}`, false);
          await link.click();
        }
        await expect(page).toHaveURL(new RegExp(`/capsulas/${edition.segment}$`));
        await expect(page.getByRole("heading", { level: 1, name: "Escritorio" })).toBeVisible();

        await page.goto("/capsulas?utm_source=instagram&utm_medium=social&utm_campaign=capsulas");
        await expect(page).toHaveURL(new RegExp(`/capsulas/${edition.segment}\\?utm_source=instagram&utm_medium=social&utm_campaign=capsulas$`));
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);

        const conditions = page.locator("section", { has: page.getByRole("heading", { name: "Cómo funciona y condiciones" }) });
        await expect(conditions).toContainText("1 cápsula = 1 papel con el nombre de 1 producto");
        await expect(conditions).toContainText("Ley 1480 de 2011, art. 47");
        await expect(conditions.getByRole("link", { name: "política de cambios y devoluciones" })).toHaveAttribute("href", "/politicas/devoluciones");
        await expect(conditions.getByRole("link", { name: "política de tratamiento de datos" })).toHaveAttribute("href", "/politicas/privacidad#videos-de-capsulas");
        await expect(page.locator("body")).not.toContainText(/suerte/i);
        await noHorizontalScroll(page);
        await conditions.scrollIntoViewIfNeeded();
        await conditions.screenshot({ path: path.join(SCREENSHOTS, `condiciones-${viewport.name}.png`) });
        expect(errors).toEqual([]);
      });
    }

    test("/capsules redirige a /capsulas", async ({ page }) => {
      const response = await page.request.get("/capsules", { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(response.headers().location).toMatch(/\/capsulas$/);
      const nested = await page.request.get(`/capsules/${edition.segment}`, { maxRedirects: 0 });
      expect(nested.status()).toBe(308);
      expect(nested.headers().location).toMatch(new RegExp(`/capsulas/${edition.segment}$`));
    });
  });
});
