import { expect, test } from "./helpers/safe-test";

import { gotoPublicPage } from "./helpers/public-page";

const analyticsMode = process.env.E2E_ANALYTICS_EXPECTED_MODE;
const baseUrl = process.env.E2E_BASE_URL || "https://papeleriapdepapel.com";
const baseHostname = new URL(baseUrl).hostname;
const analyticsEnabled = analyticsMode
  ? analyticsMode === "enabled"
  : !["localhost", "127.0.0.1"].includes(baseHostname);

test("respeta la bandera local de analítica", async ({ page }) => {
  await gotoPublicPage(page, "/");

  const privacyHeading = page.getByRole("region", {
    name: "Preferencias de privacidad",
  });

  if (analyticsEnabled) {
    await expect(privacyHeading).toBeVisible();
  } else {
    await expect(privacyHeading).toHaveCount(0);
  }
});

test("no carga GA, Clarity ni TikTok antes del consentimiento", async ({ page }) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms|analytics\.tiktok\.com)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await expect(
    page.getByRole("region", { name: "Preferencias de privacidad" }),
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
  await page.route(/(googletagmanager\.com|clarity\.ms|analytics\.tiktok\.com)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await page.getByRole("button", { name: "Aceptar todo" }).click();

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
  if (process.env.E2E_EXPECT_TIKTOK_PIXEL !== "0") {
    // El píxel de TikTok solo con «Aceptar todo» (o «Publicidad»); la petición se corta aquí.
    await expect
      .poll(
        () => analyticsRequests.some((url) => url.includes("analytics.tiktok.com/i18n/pixel/events.js?sdkid=")),
        { timeout: 8_000 },
      )
      .toBeTruthy();
  }
});

test("«Solo necesarias» mantiene apagados GA, Clarity y TikTok", async ({
  page,
}) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );

  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms|analytics\.tiktok\.com)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });

  await gotoPublicPage(page, "/");
  await page.getByRole("button", { name: "Solo necesarias" }).click();
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

  const cookieName = "pdepapel_analytics_consent_v3";
  const storageKey = "pdepapel:analytics-consent:v3";
  const analyticsRequests: string[] = [];
  await page.route(/(googletagmanager\.com|clarity\.ms|analytics\.tiktok\.com)/, async (route) => {
    analyticsRequests.push(route.request().url());
    await route.abort();
  });
  const privacyHeading = page.getByRole("region", {
    name: "Preferencias de privacidad",
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
  await page.getByRole("button", { name: "Aceptar todo" }).click();
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

test("el aviso de privacidad no bloquea los controles del catálogo en móvil", async ({
  page,
}, testInfo) => {
  test.skip(
    !analyticsEnabled,
    "Requiere la bandera local de analítica activa.",
  );
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Solo aplica al aviso fijo sobre la vista móvil.",
  );

  await page.route(/(googletagmanager\.com|clarity\.ms|analytics\.tiktok\.com)/, (route) =>
    route.abort(),
  );
  await gotoPublicPage(page, "/tienda");
  await expect(
    page.getByRole("region", { name: "Preferencias de privacidad" }),
  ).toBeVisible();

  // The banner reserves its own height in the page's scroll padding, so
  // controls beneath it can be scrolled into a clickable position.
  await page.getByRole("button", { name: "Filtros" }).click({ timeout: 10_000 });
  await expect(
    page.getByRole("dialog", { name: "Filtros de productos" }),
  ).toBeVisible();
});
