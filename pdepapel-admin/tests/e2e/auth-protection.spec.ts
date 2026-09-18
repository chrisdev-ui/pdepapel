import { expect, test } from "./helpers/image-stub";

test("protege el panel de administración antes de cargar datos de la tienda", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.waitForURL(/\/iniciar-sesion/, { timeout: 30_000 });
});
