import { expect, test } from "@playwright/test";

import { gotoPublicPage } from "./helpers/public-page";

const analyticsEnabled =
  process.env.E2E_ANALYTICS_EXPECTED_MODE === "enabled";

test("respeta la bandera local de analítica", async ({ page }) => {
  await gotoPublicPage(page, "/");

  const privacyHeading = page.getByRole("heading", {
    name: "Tu privacidad, tus decisiones",
  });

  if (analyticsEnabled) {
    await expect(privacyHeading).toBeVisible();
  } else {
    await expect(privacyHeading).toHaveCount(0);
  }
});

test("no carga GA ni Clarity antes del consentimiento", async ({ page }) => {
  test.skip(!analyticsEnabled, "Requiere la bandera local de analítica activa.");

  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await expect(
    page.getByRole("heading", { name: "Tu privacidad, tus decisiones" }),
  ).toBeVisible();
  await page.waitForTimeout(2_200);

  expect(analyticsRequests).toEqual([]);
});

test("carga los proveedores de prueba solo después de aceptar", async ({
  page,
}) => {
  test.skip(!analyticsEnabled, "Requiere la bandera local de analítica activa.");

  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();

  await expect
    .poll(
      () =>
        analyticsRequests.some((url) =>
          url.includes("googletagmanager.com/gtag/js?id=G-LOCALTEST"),
        ),
      { timeout: 8_000 },
    )
    .toBeTruthy();
  await expect
    .poll(
      () =>
        analyticsRequests.some((url) =>
          url.includes("clarity.ms/tag/localtest123"),
        ),
      { timeout: 8_000 },
    )
    .toBeTruthy();
});

test("rechazar opcionales mantiene ambos proveedores apagados", async ({
  page,
}) => {
  test.skip(!analyticsEnabled, "Requiere la bandera local de analítica activa.");

  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await page.getByRole("button", { name: "Rechazar opcionales" }).click();
  await page.waitForTimeout(2_200);

  expect(analyticsRequests).toEqual([]);
});
