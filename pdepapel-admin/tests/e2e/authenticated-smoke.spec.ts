import { createClerkClient } from "@clerk/backend";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const testStoreId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const hasTestClerkCredentials =
  clerkSecretKey?.startsWith("sk_test_") &&
  clerkPublishableKey?.startsWith("pk_test_");
const hasConfiguration = Boolean(
  testStoreId && clerkUserId && hasTestClerkCredentials,
);

test.use({ trace: "off" });

test.describe("panel autenticado de pruebas", () => {
  if (process.env.E2E_REQUIRE_CLERK === "1" && !hasConfiguration) {
    throw new Error(
      "Define CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y E2E_ADMIN_CLERK_USER_ID con claves de desarrollo de Clerk.",
    );
  }

  test.skip(
    !hasConfiguration,
    "Define claves sk_test_/pk_test_ de Clerk y E2E_ADMIN_CLERK_USER_ID para ejecutar las pruebas autenticadas.",
  );

  test("carga productos, pedidos e inventario sin redirigir a inicio de sesión", async ({
    page,
  }) => {
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey! });
    const redirectUrl = new URL(
      `/${testStoreId}/productos`,
      baseURL,
    ).toString();
    const agentTask = await clerkClient.agentTasks.create({
      onBehalfOf: { userId: clerkUserId! },
      permissions: "*",
      agentName: "pdepapel-admin-e2e",
      taskDescription: "Prueba E2E autenticada del panel administrativo",
      redirectUrl,
      sessionMaxDurationInSeconds: 300,
    });

    await page.goto(agentTask.url, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(redirectUrl);

    for (const path of ["productos", "pedidos", "inventario"]) {
      const response = await page.goto(`/${testStoreId}/${path}`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.ok(), path).toBeTruthy();
      await expect(page).not.toHaveURL(/\/sign-in/);
    }
  });
});
