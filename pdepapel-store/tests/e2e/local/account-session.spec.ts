import { createClerkClient } from "@clerk/backend";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, Page, test } from "./helpers/local-test";
import { skipPrivacyBanner } from "../helpers/public-page";
import { fillContact, fillDeliveryWithoutCarrier, formButton, startCheckout } from "./helpers/checkout";
import { localAdminOrigin } from "./helpers/local-environment";

/**
 * Sesión de Clerk con el Clerk sin interfaz de las páginas públicas: el token
 * sigue llegando a la administración (dueña → PANEL, clienta → STORE), los
 * favoritos se sincronizan, la cuenta abre con Clerk completo y el menú propio
 * cierra la sesión. La sesión la abre una tarea de agente de Clerk con las
 * claves de desarrollo de la tienda: no se escribe ninguna contraseña.
 */

const STORE_DIR = process.cwd();
const ADMIN_DIR = path.resolve(STORE_DIR, "../pdepapel-admin");
const BASE_URL = "http://localhost:3100";
const PRODUCT_PATH = "/producto/producto-feria-e2e";

function readEnvValue(file: string, name: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*"?([^"\\r\\n]+)"?\\s*$`, "m"));
  return match?.[1].trim();
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? readEnvValue(path.join(STORE_DIR, ".env"), "CLERK_SECRET_KEY");
const ownerUserId = readEnvValue(path.join(ADMIN_DIR, ".env.e2e.local"), "E2E_ADMIN_CLERK_USER_ID");
const hasConfiguration = Boolean(clerkSecretKey?.startsWith("sk_test_") && ownerUserId);

let customerUserId: string | undefined;

async function signInAs(page: Page, userId: string, targetPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId },
    permissions: "*",
    agentName: "pdepapel-store-e2e",
    taskDescription: "Comprobar la sesión de la tienda con Clerk sin interfaz",
    redirectUrl: new URL(targetPath, BASE_URL).toString(),
    sessionMaxDurationInSeconds: 600,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.origin === BASE_URL && url.pathname === targetPath, { timeout: 120_000 });
}

/** Lee el pedido en `pdepapel_test` con el cliente de la administración (la API pública no expone estos campos). */
function readOrderRow(orderId: string) {
  const script =
    'const { PrismaClient } = require("@prisma/client"); const db = new PrismaClient();' +
    "db.order.findUnique({ where: { id: process.argv[1] }, select: { source: true, userId: true, analyticsConsent: true, analyticsClientId: true, analyticsSessionId: true } })" +
    ".then((row) => { console.log(JSON.stringify(row)); return db.$disconnect(); });";
  const output = execFileSync("node", ["scripts/with-test-env.mjs", "node", "-e", script, orderId], { cwd: ADMIN_DIR, encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").pop()!);
}

async function loadedClerkScript(page: Page) {
  await page.waitForFunction(() => Boolean(document.querySelector("script[data-clerk-js-script]")), undefined, { timeout: 30_000 });
  return page.evaluate(() => document.querySelector<HTMLScriptElement>("script[data-clerk-js-script]")!.src);
}

/** Pedido por transferencia con la sesión abierta; devuelve el id y las cabeceras que llevó. */
async function placeTransferOrder(page: Page, analytics = false) {
  await startCheckout(page, { analytics });
  await fillContact(page);
  await fillDeliveryWithoutCarrier(page);
  await page.getByText("Transferencia bancaria", { exact: true }).click();
  const request = page.waitForRequest((req) => req.method() === "POST" && /\/api\/[^/]+\/orders$/.test(req.url()));
  await formButton(page, "Confirmar pedido").click();
  const sent = await request;
  await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 60_000 });
  return { orderId: new URL(page.url()).pathname.split("/").pop()!, authorization: sent.headers()["authorization"] ?? "" };
}

function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /418|423|425|Hydration|did not match/i.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/418|423|425|Hydration/i.test(String(error))) errors.push(String(error));
  });
  return errors;
}

test.describe("Clerk sin interfaz en las páginas públicas", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });
  test.skip(!hasConfiguration, "Necesita las claves de desarrollo de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    const clerk = createClerkClient({ secretKey: clerkSecretKey! });
    const { data } = await clerk.users.getUserList({ limit: 20 });
    customerUserId = data.find((user) => user.id !== ownerUserId)?.id;
  });

  test("las páginas públicas cargan Clerk sin interfaz y la cuenta lo carga completo, con regreso a la página de origen", async ({ page }) => {
    await skipPrivacyBanner(page);
    for (const publicPath of ["/", "/tienda", PRODUCT_PATH]) {
      const uiChunks: string[] = [];
      page.on("request", (request) => {
        if (/ui-common_clerk|framework_clerk|vendors_clerk/.test(request.url())) uiChunks.push(request.url());
      });
      await page.goto(publicPath);
      expect(await loadedClerkScript(page), publicPath).toContain("clerk.headless.browser.js");
      // La tienda sondea en segundo plano y la red nunca queda quieta: se deja asentar.
      await page.waitForTimeout(4000);
      expect(uiChunks, publicPath).toEqual([]);
      page.removeAllListeners("request");
    }

    // El enlace de iniciar sesión es una carga completa que lleva la página de origen.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PRODUCT_PATH);
    await page.evaluate(() => ((window as unknown as { __sinRecarga: boolean }).__sinRecarga = true));
    await page.getByRole("link", { name: /Mi cuenta: iniciar sesión/ }).click();
    await page.waitForURL(/\/iniciar-sesion/);
    expect(new URL(page.url()).searchParams.get("redirect_url")).toBe(PRODUCT_PATH);
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga ?? false)).toBe(false);
    expect(await loadedClerkScript(page)).toContain("clerk.browser.js");
    expect(await loadedClerkScript(page)).not.toContain("headless");
    await expect(page.locator(".cl-signIn-root")).toBeVisible({ timeout: 30_000 });
  });

  test("clienta con sesión: menú propio, token en favoritos y pedidos, reseñas, búsquedas guardadas y cierre de sesión", async ({ page }) => {
    test.skip(!customerUserId, "No hay una segunda persona en la instancia de desarrollo de Clerk.");
    await skipPrivacyBanner(page, true);
    const hydration = collectHydrationErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, customerUserId!, "/tienda");
    expect(await loadedClerkScript(page)).toContain("clerk.headless.browser.js");

    // Menú propio: teclado, foco y opciones.
    const trigger = page.getByRole("button", { name: "Abrir menú de usuario" });
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    for (const label of ["Mi cuenta", "Mis pedidos", "Mis búsquedas", "Administrar cuenta", "Cerrar sesión"]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // Favorito: la sincronización va con el token de la sesión.
    await page.goto(PRODUCT_PATH);
    const wishlistSync = page.waitForResponse((res) => res.url().startsWith(localAdminOrigin) && /\/account\/wishlist/.test(res.url()) && res.request().method() === "PUT", { timeout: 30_000 });
    await page.getByRole("button", { name: "Agregar a favoritos" }).first().click();
    const synced = await wishlistSync;
    expect(synced.request().headers()["authorization"]).toMatch(/^Bearer .+/);
    expect(synced.status()).toBe(200);
    await page.goto("/favoritos");
    await expect(page.getByText("Producto feria E2E").first()).toBeVisible({ timeout: 30_000 });

    // Reseñas y búsquedas guardadas ven la sesión.
    await page.goto(PRODUCT_PATH);
    await expect(page.getByText("Inicia sesión para escribir una reseña")).toHaveCount(0);
    await page.goto("/tienda?sortOption=priceAsc&colorId=e2e-fair-color");
    await expect(page.getByRole("button", { name: /Guardar búsqueda/i })).toBeVisible({ timeout: 30_000 });

    // Pedido por transferencia: la administración lo clasifica como de la tienda y a nombre de la clienta.
    const { orderId, authorization } = await placeTransferOrder(page, true);
    expect(authorization).toMatch(/^Bearer .+/);
    const row = readOrderRow(orderId);
    expect(row).toMatchObject({ source: "STORE", userId: customerUserId, analyticsConsent: true });

    // Sin errores de hidratación en teléfono ni en escritorio con la sesión abierta.
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForTimeout(3000);
    }
    expect(hydration).toEqual([]);

    // Cerrar sesión desde el menú propio.
    await page.getByRole("button", { name: "Abrir menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("link", { name: /Mi cuenta: iniciar sesión/ })).toBeVisible({ timeout: 30_000 });
    const clientUat = (await page.context().cookies()).find((cookie) => cookie.name === "__client_uat");
    expect(clientUat?.value ?? "0").toBe("0");
  });

  test("con sesión abierta en una página pública, Mi cuenta abre sin pedir iniciar sesión", async ({ page }) => {
    test.skip(!customerUserId, "No hay una segunda persona en la instancia de desarrollo de Clerk.");
    await skipPrivacyBanner(page);
    await signInAs(page, customerUserId!, "/tienda");
    expect(await loadedClerkScript(page)).toContain("clerk.headless.browser.js");
    await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session), undefined, { timeout: 30_000 });
    console.log("cookies:", (await page.context().cookies()).map((cookie) => cookie.name).sort().join(","));
    await page.goto("/mi-cuenta");
    expect(new URL(page.url()).pathname).toBe("/mi-cuenta");
    expect(await loadedClerkScript(page)).toMatch(/clerk\.browser\.js$/);
  });

  test("una navegación sin recarga a la cuenta termina con Clerk completo", async ({ page }) => {
    test.skip(!customerUserId, "No hay una segunda persona en la instancia de desarrollo de Clerk.");
    await skipPrivacyBanner(page);
    await signInAs(page, customerUserId!, "/tienda");
    expect(await loadedClerkScript(page)).toContain("clerk.headless.browser.js");
    await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session), undefined, { timeout: 30_000 });
    await page.evaluate(() => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push("/mi-cuenta"));
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 60_000 }).toBe("/mi-cuenta");
    await expect.poll(() => loadedClerkScript(page).catch(() => ""), { timeout: 60_000 }).toMatch(/clerk\.browser\.js$/);
  });

  test("dueña con sesión: el pedido queda del panel y sin analítica", async ({ page }) => {
    await skipPrivacyBanner(page, true);
    await signInAs(page, ownerUserId!, "/tienda");
    const { orderId, authorization } = await placeTransferOrder(page, true);
    expect(authorization).toMatch(/^Bearer .+/);
    expect(readOrderRow(orderId)).toEqual({ source: "PANEL", userId: ownerUserId, analyticsConsent: null, analyticsClientId: null, analyticsSessionId: null });
  });
});

test.describe("navegación entre grupos de layout", () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, "Necesita un NEXT_PUBLIC_GA_MEASUREMENT_ID de prueba en la compilación local para contar page_view.");

  /**
   * Una navegación sin recarga entre la cuenta y la tienda remontaría la
   * cabecera: medido el 2026-10-13, se perdía el page_view y se descargaba el
   * otro Clerk. Por eso salir de la cuenta es una carga completa.
   */
  for (const exit of ["enlace de la cabecera", "buscador de la cabecera"] as const) {
    test(`salir de la cuenta por el ${exit} carga la página: un page_view por página y el carrito sigue`, async ({ page }) => {
      await skipPrivacyBanner(page, true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addInitScript(() => {
        if (window.sessionStorage.getItem("cart-seeded")) return;
        window.sessionStorage.setItem("cart-seeded", "1");
        window.localStorage.setItem(
          "cart-storage",
          JSON.stringify({ state: { items: [{ id: "e2e-fair-product", slug: "producto-feria-e2e", name: "Producto feria E2E", price: "10000", stock: 20, images: [], quantity: 1 }] }, version: 1 }),
        );
      });
      let pageViews = 0;
      await page.route(/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/, async (route) => {
        const request = route.request();
        pageViews += `${request.url()}\n${request.postData() ?? ""}`.split("en=page_view").length - 1;
        await route.fulfill({ status: 204 });
      });

      await page.goto("/iniciar-sesion");
      await expect(page.locator(".cl-signIn-root")).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => pageViews, { timeout: 20_000 }).toBe(1);
      await page.evaluate(() => ((window as unknown as { __sinRecarga: boolean }).__sinRecarga = true));

      if (exit === "enlace de la cabecera") {
        await page.getByRole("link", { name: "Tienda", exact: true }).first().click();
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe("/tienda");
      } else {
        const search = page.locator("input[type=\"search\"]:visible").first();
        await search.fill("agenda");
        await search.press("Enter");
        await expect.poll(() => new URL(page.url()).searchParams.get("search"), { timeout: 30_000 }).toBe("agenda");
      }
      await page.waitForLoadState("load");
      await expect(page.getByRole("button", { name: /Abrir carrito, 1 producto/ }).first()).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga ?? false)).toBe(false);
      expect(await loadedClerkScript(page)).toContain("clerk.headless.browser.js");
      await expect.poll(() => pageViews, { timeout: 20_000 }).toBe(2);
    });
  }
});
