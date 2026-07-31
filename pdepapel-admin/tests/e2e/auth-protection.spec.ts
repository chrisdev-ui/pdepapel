import { expect, test } from "@playwright/test";

test("protege el panel de administración antes de cargar datos de la tienda", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/sign-in/);
});
