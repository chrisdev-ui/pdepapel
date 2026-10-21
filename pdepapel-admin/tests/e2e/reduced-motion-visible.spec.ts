import { createClerkClient } from "@clerk/backend";

import { expect, test } from "./helpers/image-stub";

/**
 * Con «reducir movimiento» la pantalla tiene que quedar visible. El servidor
 * pintaba la entrada (opacity 0, 8 px abajo) y el cliente, al ver la
 * preferencia, cambiaba a un <div> sin estilo: React no corrige atributos al
 * hidratar, así que la página se quedaba invisible hasta navegar.
 *
 *   npm run test:e2e:prod -- tests/e2e/reduced-motion-visible.spec.ts --workers=1
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);

test.use({ trace: "off" });

test.describe("reducir movimiento", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    test(`la pantalla queda visible (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      const clerk = createClerkClient({ secretKey: clerkSecretKey! });
      const task = await clerk.agentTasks.create({
        onBehalfOf: { userId: clerkUserId! },
        permissions: "*",
        agentName: "pdepapel-admin-e2e",
        taskDescription: "Reducir movimiento",
        redirectUrl: new URL(`/${storeId}/inventario`, baseURL).toString(),
        sessionMaxDurationInSeconds: 300,
      });
      await page.goto(task.url, { waitUntil: "domcontentloaded" });
      const title = page.getByRole("heading", { level: 1 }).first();
      await expect(title).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(
          () =>
            title.evaluate((node) => {
              for (let el: Element | null = node; el; el = el.parentElement) if (getComputedStyle(el).opacity !== "1") return getComputedStyle(el).opacity;
              return "1";
            }),
          { timeout: 5_000 },
        )
        .toBe("1");
    });
  }
});
