import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Términos y condiciones a 390 y 1280: la página con sus secciones, el enlace
 * en «Términos Legales» del pie, la entrada del sitemap y la redirección de
 * /policies/terms. El enlace nuevo no desborda el pie ni «Otras políticas» en
 * ninguna página de políticas.
 */
const SHOTS = path.resolve(process.cwd(), "../pdepapel-admin/output/screenshots/terminos");

const insideParent = async (page: Page, selector: string) => {
  const overflow = await page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const parent = node.parentElement!.closest("section, nav, ul, ol")!.getBoundingClientRect();
      return Math.max(0, box.right - parent.right, parent.left - box.left);
    }),
  );
  expect(overflow.length).toBeGreaterThan(0);
  expect(Math.max(...overflow)).toBeLessThanOrEqual(1);
};

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const viewport of [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
]) {
  test(`términos a ${viewport.name}: página, pie de página y otras políticas`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(viewport);
    await skipPrivacyBanner(page);

    await page.goto("/tienda");
    const legal = page.locator("footer section", { has: page.getByRole("heading", { name: "Términos Legales" }) });
    const link = legal.getByRole("link", { name: "Términos y condiciones" });
    await link.scrollIntoViewIfNeeded();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await insideParent(page, 'footer a[href="/politicas/terminos"]');
    await page.screenshot({ path: path.join(SHOTS, `pie-${viewport.name}.png`), clip: (await legal.boundingBox())! });
    await link.click();
    await page.waitForURL("**/politicas/terminos");

    await expect(page.getByRole("heading", { level: 1, name: "Términos y condiciones de P de Papel" })).toBeVisible();
    await expect(page.getByText("21 de octubre de 2026").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Reversión del pago" })).toBeVisible();
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/politicas\/terminos$/);
    await expect(page.locator("body")).not.toContainText(/\[(razón social|NIT o C\.C\.|fecha)[^\]]*\]/);
    await noHorizontalScroll(page);
    await page.screenshot({ path: path.join(SHOTS, `terminos-${viewport.name}.png`), fullPage: true });

    await page.goto("/politicas/privacidad");
    await expect(page.getByTestId("responsable")).toContainText("Responsable del tratamiento:");

    const otherPolicies = viewport.width >= 1024 ? 'aside a[href="/politicas/terminos"]' : 'nav[aria-label="Otras políticas"] a[href="/politicas/terminos"]';
    for (const route of ["/politicas/privacidad", "/politicas/envios", "/politicas/devoluciones"]) {
      await page.goto(route);
      await insideParent(page, otherPolicies);
      await noHorizontalScroll(page);
    }
  });
}

test("el sitemap lista los términos y /policies/terms redirige", async ({ page, request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("/politicas/terminos</loc>");

  const response = await page.goto("/policies/terms");
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/politicas/terminos");
  const redirect = await request.get("/policies/terms", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
});
