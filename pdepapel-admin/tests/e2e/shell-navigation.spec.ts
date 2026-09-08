import { createClerkClient } from "@clerk/backend";
import { expect, test, type Page } from "@playwright/test";

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

async function signIn(page: Page, path: string) {
  const clerkClient = createClerkClient({ secretKey: clerkSecretKey! });
  const agentTask = await clerkClient.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba E2E del armazón del panel",
    redirectUrl: new URL(`/${testStoreId}/${path}`, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(agentTask.url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/${testStoreId}/${path}`), {
    timeout: 60_000,
  });
  // Clerk (instancia de desarrollo) termina de fijar la sesión en el navegador
  // después de cargar la página; navegar antes deja al servidor sin sesión.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

test.use({ trace: "off" });

// En modo desarrollo cada ruta se compila la primera vez; en serie evita que
// tres navegadores disputen el mismo servidor y agoten los tiempos de espera.
test.describe.configure({ mode: "serial" });

test.describe("armazón del panel (rediseño 2026-09)", () => {
  test.skip(
    !hasConfiguration,
    "Define claves de desarrollo de Clerk y E2E_ADMIN_CLERK_USER_ID.",
  );

  test("la barra lateral, las pestañas y la barra de comandos llevan a cada destino", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await signIn(page, "pedidos");
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible({ timeout: 60_000 });

    // Barra lateral con grupos y destinos.
    const sidebar = page.getByRole("navigation", { name: "Secciones del panel" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Punto de venta", exact: true })).toBeVisible();

    // Un destino con pestañas: la hija cambia la URL y la pestaña activa.
    await sidebar.getByRole("button", { name: /Expandir Punto de venta/ }).click();
    await sidebar.getByRole("link", { name: "Etiquetas" }).click();
    await expect(page).toHaveURL(/\/ventas-rapidas\?tab=etiquetas$/, { timeout: 60_000 });
    await expect(page.getByRole("tab", { name: "Etiquetas" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });

    // Vistas de una lista viven en la URL sin recargar la página.
    await page.goto(`/${testStoreId}/pedidos`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /Todos/ }).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/pedidos\?vista=todos$/);

    // Barra de comandos: ⌘ K, escribir y elegir un destino.
    await page.getByRole("button", { name: /Buscar o escribir qué quieres hacer/ }).click();
    const palette = page.getByPlaceholder("Busca o escribe qué quieres hacer…");
    await expect(palette).toBeVisible();
    await palette.fill("inventario");
    await page.getByRole("option", { name: /^Inventario/ }).first().click();
    await expect(page).toHaveURL(/\/inventario/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible({ timeout: 60_000 });

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("las rutas antiguas redirigen a su nueva pestaña o vista", async ({ page }) => {
    test.setTimeout(600_000);
    await signIn(page, "pedidos");

    const redirects: Array<[string, RegExp]> = [
      ["stock-bajo", /\/inventario\?vista=stock-critico$/],
      ["agotados", /\/inventario\?vista=agotados$/],
      ["ofertas", /\/promociones$/],
      ["cupones", /\/promociones\?tab=cupones$/],
      ["resenas", /\/clientes\?tab=resenas$/],
      ["cajas", /\/configuracion\?tab=envios$/],
      ["diapositivas", /\/contenido$/],
      ["banners", /\/contenido\?tab=banners$/],
      ["publicaciones", /\/contenido\?tab=redes$/],
    ];
    for (const [oldPath, target] of redirects) {
      await page.goto(`/${testStoreId}/${oldPath}`, { waitUntil: "domcontentloaded" });
      await expect(page, `${oldPath} debería redirigir`).toHaveURL(target, { timeout: 120_000 });
    }
  });

  test("en el teléfono la barra inferior lleva a vender", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "pedidos");
    const bottomBar = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(bottomBar).toBeVisible({ timeout: 60_000 });
    await bottomBar.getByRole("link", { name: /Vender/ }).click();
    await expect(page).toHaveURL(/\/ventas-rapidas/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Punto de venta" })).toBeVisible({ timeout: 60_000 });
  });
});
