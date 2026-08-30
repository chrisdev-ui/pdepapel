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
