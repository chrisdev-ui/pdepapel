import { createClerkClient } from "@clerk/backend";
import { expect, test, type Page } from "@playwright/test";

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

async function openFairCreationForm(page: Page) {
  const formTitle = page.getByRole("heading", { name: "Crear feria" });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole("button", { name: "Nueva feria" }).click();
    if (await formTitle.isVisible()) return;
    await page.waitForTimeout(500);
  }

  await expect(formTitle).toBeVisible({ timeout: 30_000 });
}

test.use({ trace: "off" });

test.describe("ventas en feria", () => {
  if (process.env.E2E_REQUIRE_CLERK === "1" && !hasConfiguration) {
    throw new Error(
      "Define CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y E2E_ADMIN_CLERK_USER_ID con claves de desarrollo de Clerk.",
    );
  }

  test.skip(
    !hasConfiguration,
    "Define claves sk_test_/pk_test_ de Clerk y E2E_ADMIN_CLERK_USER_ID para ejecutar las pruebas autenticadas.",
  );

  test("permite reservar, cobrar y conciliar una venta presencial", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey! });
    const redirectUrl = new URL(`/${testStoreId}/ferias`, baseURL).toString();
    const agentTask = await clerkClient.agentTasks.create({
      onBehalfOf: { userId: clerkUserId! },
      permissions: "*",
      agentName: "pdepapel-admin-e2e",
      taskDescription: "Prueba E2E de ventas presenciales en feria",
      redirectUrl,
      sessionMaxDurationInSeconds: 300,
    });

    await page.goto(agentTask.url, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      new RegExp(`/${testStoreId}/ferias(?:\\?.*)?$`),
    );

    const fairName = `E2E Feria ${Date.now()}`;
    await openFairCreationForm(page);
    await page.getByLabel("Nombre de la feria").fill(fairName);
    await page.getByLabel("Lugar").fill("Prueba automatizada");
    await Promise.all([
      page.waitForURL(new RegExp(`/${testStoreId}/ferias/[^/?]+$`), {
        timeout: 30_000,
      }),
      page.getByRole("button", { name: "Crear y reservar inventario" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: fairName })).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole("combobox", { name: "Producto para reservar" })
      .click();
    await page
      .getByPlaceholder("Buscar por nombre o SKU...")
      .fill("E2E-FAIR-PRODUCT");
    await page.getByText("Producto feria E2E", { exact: false }).click();
    await page.getByLabel("Cantidad").fill("2");
    await page.getByRole("button", { name: "Agregar" }).click();
    await page.getByRole("button", { name: "Reservar en inventario" }).click();
    await expect(
      page.getByText("2 unidades ya están reservadas para esta feria."),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Abrir para ventas" }).click();
    await expect(page.getByText("Abierta", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel("Código de barras o QR").fill("E2E-FAIR-PRODUCT");
    await page.getByRole("button", { name: "Agregar código" }).click();
    await expect(
      page.getByText("Producto feria E2E", { exact: true }).last(),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Confirmar pago" }).click();
    await expect(
      page.getByText("Venta registrada", { exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Conciliar y cerrar" }).click();
    await expect(
      page.getByRole("heading", { name: "¿Cerrar esta feria?" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sí, conciliar y cerrar" }).click();
    await expect(
      page.getByRole("heading", { name: "Feria cerrada" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
