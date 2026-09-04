import { expect, Page } from "@playwright/test";

export async function gotoPublicPage(page: Page, path: string) {
  const successfulDocument = page.waitForResponse(
    (candidate) =>
      candidate.request().resourceType() === "document" &&
      new URL(candidate.url()).pathname === path &&
      candidate.status() === 200,
    { timeout: 20_000 },
  );
  const initialResponse = await page.goto(path, {
    waitUntil: "domcontentloaded",
  });
  const response = await successfulDocument;

  if (initialResponse?.status() === 401) {
    await page.waitForLoadState("domcontentloaded");
  }

  expect(response?.status()).toBe(200);
}

/**
 * Records an analytics decision before any page script runs, so the privacy
 * banner never renders. The banner is fixed to the bottom of the viewport
 * with a very high z-index and, on phone-sized viewports, sits over catalog
 * controls such as the "Filtros" button; Playwright then reports that the
 * banner "intercepts pointer events" until the test times out. Use this in
 * specs that interact with the page and do not test the consent flow itself.
 */
export async function skipPrivacyBanner(page: Page, analytics = false) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage may be unavailable; the banner will simply show.
      }
    },
    {
      key: "pdepapel:analytics-consent:v2",
      value: JSON.stringify({
        analytics,
        updatedAt: "2026-09-04T00:00:00.000Z",
      }),
    },
  );
}
