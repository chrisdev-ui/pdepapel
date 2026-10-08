import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";

/**
 * Una pestaña abierta antes de un despliegue avisa que hay versión nueva y,
 * antes de escribir, pregunta si recargar. Necesita el servidor de pruebas
 * arrancado con VERCEL_GIT_COMMIT_SHA (el commit con el que se construyó).
 */

const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const hasConfiguration = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA;

test.use({ trace: "off" });
test.setTimeout(300_000);

async function signIn(page: Page, path: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Aviso de versión nueva del panel",
    redirectUrl: new URL(path, baseURL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === path, { timeout: 120_000 });
}

test.describe("aviso de versión nueva", () => {
  test.skip(!hasConfiguration || !buildSha, "Necesita claves de desarrollo de Clerk y VERCEL_GIT_COMMIT_SHA.");

  test("avisa, y antes de guardar pregunta; «Recargar» no envía el cambio", async ({ page }) => {
    let deployed = buildSha!;
    await page.route("**/api/version", (route) => route.fulfill({ json: { sha: deployed } }));
    const writes: string[] = [];
    await page.route(`**/api/${storeId}/version-e2e-probe`, (route) => {
      writes.push(route.request().method());
      return route.fulfill({ json: { ok: true } });
    });

    await signIn(page, `/${storeId}/productos`);
    await expect(page.getByText("Hay una versión nueva del panel")).toHaveCount(0);

    deployed = "otro-commit";
    // Volver a la pestaña consulta otra vez, como mucho cada 30 s.
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByText("Hay una versión nueva del panel. Recarga para usarla")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    await page.evaluate((path) => {
      void fetch(path, { method: "PATCH" }).catch(() => {});
    }, `/api/${storeId}/version-e2e-probe`);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    const reloaded = page.waitForEvent("load");
    await dialog.getByRole("button", { name: "Recargar", exact: true }).click();
    await reloaded;
    expect(writes).toEqual([]);
  });
});
