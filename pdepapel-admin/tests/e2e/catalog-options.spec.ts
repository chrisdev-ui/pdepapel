import { createClerkClient } from "@clerk/backend";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const testStoreId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const hasConfiguration = Boolean(
  testStoreId &&
  clerkUserId &&
  clerkSecretKey?.startsWith("sk_test_") &&
  clerkPublishableKey?.startsWith("pk_test_"),
);

async function prepareCatalogProposals(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/${testStoreId}/catalog-migration` &&
          response.request().method() === "POST",
        { timeout: 5_000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: "Preparar propuestas" }).click();
    const response = await responsePromise;
    if (response) return response;
    await page.waitForTimeout(500);
  }

  return null;
}

test.use({ trace: "off" });

test.describe("opciones visibles para clientes", () => {
  test.skip(
    !hasConfiguration,
    "Define claves de desarrollo de Clerk y E2E_ADMIN_CLERK_USER_ID.",
  );

  test("revisa y aplica una opción sin alterar el código interno", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const postRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") postRequests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey! });
    const redirectUrl = new URL(
      `/${testStoreId}/productos/opciones`,
      baseURL,
    ).toString();
    const agentTask = await clerkClient.agentTasks.create({
      onBehalfOf: { userId: clerkUserId! },
      permissions: "*",
      agentName: "pdepapel-admin-e2e",
      taskDescription: "Prueba E2E de opciones visibles del catálogo",
      redirectUrl,
      sessionMaxDurationInSeconds: 300,
    });

    await page.goto(agentTask.url, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      new RegExp(`/${testStoreId}/productos/opciones(?:\\?.*)?$`),
    );

    const prepareResponse = await prepareCatalogProposals(page);
    expect(
      prepareResponse?.ok(),
      prepareResponse
        ? `Preparar propuestas respondió ${prepareResponse.status()}: ${await prepareResponse.text()}`
        : `No se envió la preparación. Errores de página: ${pageErrors.join(" | ") || "ninguno"}. POST observados: ${postRequests.join(", ") || "ninguno"}`,
    ).toBeTruthy();
    const preparedToast = page.getByText(
      "Propuestas preparadas para revisión",
      { exact: true },
    );
    await expect(preparedToast).toBeVisible({ timeout: 30_000 });
    await expect(preparedToast).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Producto feria E2E", { exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByText("Revisar o editar opciones visibles", { exact: true })
      .click();
    await page.getByRole("button", { name: "Agregar opción" }).click();
    await page
      .getByLabel("Nombre de opción 1 para Producto feria E2E")
      .fill("Formato");
    await page
      .getByLabel("Valor de opción 1 para Producto feria E2E")
      .fill("A5");

    const productCheckbox = page.getByRole("checkbox", {
      name: "Seleccionar Producto feria E2E",
    });
    await expect(productCheckbox).toBeDisabled();
    await page.getByRole("button", { name: "Guardar opciones" }).click();
    await expect(productCheckbox).toBeEnabled({ timeout: 30_000 });
    await productCheckbox.check();

    await page
      .getByRole("button", { name: "Aplicar seleccionadas (1)" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Aplicar cambios revisados" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Stock, SKU, precios, nombres de producto y URLs no se modificarán.",
        { exact: false },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar" }).click();

    await expect(
      page.getByText("Prepara propuestas para comenzar la migración segura."),
    ).toBeVisible({ timeout: 30_000 });

    const optionsResponse = await page.request.get(
      `/api/${testStoreId}/catalog-options`,
    );
    expect(optionsResponse.ok()).toBeTruthy();
    const options = await optionsResponse.json();
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Formato",
          values: expect.arrayContaining([
            expect.objectContaining({ name: "A5", count: 1 }),
          ]),
        }),
      ]),
    );

    const typesResponse = await page.request.get(`/api/${testStoreId}/types`);
    const categoriesResponse = await page.request.get(
      `/api/${testStoreId}/categories`,
    );
    expect(typesResponse.ok()).toBeTruthy();
    expect(categoriesResponse.ok()).toBeTruthy();
    expect(await typesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Tipo E2E", icon: "📦" }),
      ]),
    );
    expect(await categoriesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Categoría E2E", icon: "✏️" }),
      ]),
    );

    await page.goto(`/${testStoreId}/productos/e2e-fair-product`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    const featureInput = page.getByRole("combobox", {
      name: "Nombre de característica 1",
    });
    const valueInput = page.getByRole("combobox", {
      name: "Valor de característica 1",
    });
    await expect(featureInput).toHaveValue("Formato");
    await expect(valueInput).toHaveValue("A5");

    await featureInput.click();
    await expect(featureInput).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("option", { name: /^Formato/ })).toBeVisible();
    await valueInput.click();
    await expect(valueInput).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("option", { name: /^A5/ })).toBeVisible();
  });
});
