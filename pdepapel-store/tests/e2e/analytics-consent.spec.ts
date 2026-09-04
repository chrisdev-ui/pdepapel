import { expect, test } from "@playwright/test";

import { gotoPublicPage } from "./helpers/public-page";

const analyticsMode = process.env.E2E_ANALYTICS_EXPECTED_MODE;
const baseUrl = process.env.E2E_BASE_URL || "https://papeleriapdepapel.com";
const baseHostname = new URL(baseUrl).hostname;
const analyticsEnabled = analyticsMode
  ? analyticsMode === "enabled"
  : !["localhost", "127.0.0.1"].includes(baseHostname);

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
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

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

test("carga los proveedores configurados solo después de aceptar", async ({
  page,
}) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

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
          url.includes("googletagmanager.com/gtag/js?id="),
        ),
      { timeout: 8_000 },
    )
    .toBeTruthy();
  await expect
    .poll(
      () => analyticsRequests.some((url) => url.includes("clarity.ms/tag/")),
      { timeout: 8_000 },
    )
    .toBeTruthy();
});

test("rechazar opcionales mantiene ambos proveedores apagados", async ({
  page,
}) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

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

test("recuerda la decisión de quien vuelve, incluso si Safari borra el almacenamiento local", async ({
  context,
  page,
}) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

  const cookieName = "pdepapel_analytics_consent_v2";
  const storageKey = "pdepapel:analytics-consent:v2";
  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });
  const privacyHeading = page.getByRole("heading", {
    name: "Tu privacidad, tus decisiones",
  });
  const gtagWasRequested = () =>
    analyticsRequests.some((url) =>
      url.includes("googletagmanager.com/gtag/js?id="),
    );

  await gotoPublicPage(page, "/");
  await expect(privacyHeading).toBeVisible();

  const consentResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/consent" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  expect((await consentResponse).status()).toBe(200);

  const consentCookie = (await context.cookies()).find(
    (cookie) => cookie.name === cookieName,
  );
  expect(consentCookie).toBeDefined();
  expect(consentCookie?.expires ?? 0).toBeGreaterThan(
    Date.now() / 1000 + 300 * 24 * 60 * 60,
  );

  analyticsRequests.length = 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(gtagWasRequested, { timeout: 8_000 }).toBeTruthy();
  await expect(privacyHeading).toHaveCount(0);

  // Simulate Safari's 7-day purge of script-written storage.
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  analyticsRequests.length = 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(gtagWasRequested, { timeout: 8_000 }).toBeTruthy();
  await expect(privacyHeading).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), storageKey),
    )
    .toContain('"analytics":true');
});
