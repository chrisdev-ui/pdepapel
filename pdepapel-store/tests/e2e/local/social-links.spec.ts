import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "../helpers/safe-test";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Las cuatro redes (Instagram, TikTok, Facebook, YouTube) en el pie de página
 * y en Nosotros, a 390, 768 y 1280: en orden, en pestaña nueva, con su
 * etiqueta en español, de al menos 44 px y sin desplazamiento horizontal.
 */
const SHOTS = path.resolve(process.cwd(), "../pdepapel-admin/output/screenshots/redes");
const NETWORKS = [
  ["Instagram", "https://instagram.com/papeleria.pdepapel"],
  ["TikTok", "https://tiktok.com/@papeleria.pdepapel"],
  ["Facebook", "https://www.facebook.com/papeleriapdepapel/"],
  ["YouTube", "https://www.youtube.com/@papeleriapdepapel"],
] as const;

async function expectNetworks(page: Page, scope: ReturnType<Page["locator"]>) {
  const links = scope.getByRole("link", { name: / de P de Papel$/ });
  await expect(links).toHaveCount(NETWORKS.length);
  for (const [index, [label, href]] of NETWORKS.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAccessibleName(`${label} de P de Papel`);
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const viewport of [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
]) {
  test(`redes a ${viewport.name}: pie de página y Nosotros`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(viewport);
    await skipPrivacyBanner(page);

    await page.goto("/tienda");
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await expectNetworks(page, footer.locator("section", { has: page.getByRole("heading", { name: "Redes Sociales" }) }));
    await noHorizontalScroll(page);
    await footer.screenshot({ path: path.join(SHOTS, `pie-${viewport.name}.png`) });

    await page.goto("/nosotros");
    const main = page.locator("main");
    const hero = main.locator("section").first();
    await expectNetworks(page, hero);
    const follow = main.locator("section", { has: page.getByRole("heading", { name: "¡Sé parte de nuestro mundo colorido!" }) });
    await expectNetworks(page, follow);
    await noHorizontalScroll(page);
    await hero.screenshot({ path: path.join(SHOTS, `nosotros-inicio-${viewport.name}.png`) });
    await follow.scrollIntoViewIfNeeded();
    await follow.screenshot({ path: path.join(SHOTS, `nosotros-siguenos-${viewport.name}.png`) });
  });
}
