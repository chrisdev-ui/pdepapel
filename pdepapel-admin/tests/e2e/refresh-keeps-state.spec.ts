import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Guardar algo en una pantalla del panel no borra lo que quedó abierto ni lo
 * que se escribió sin guardar. Cualquier `router.refresh()` vuelve a montar
 * el árbol del cliente bajo `(routes)` (loading.tsx + template.tsx), así que
 * cada caso guarda una cosa y comprueba que la otra siga en pantalla.
 *
 *   npm run test:e2e:seed-admin
 *   npm run test:e2e -- tests/e2e/refresh-keeps-state.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);

const FAIR_PRODUCT = "e2e-fair-product";
const RESERVE_PRODUCT = "e2e-reserve-product";

test.use({ trace: "off" });
test.describe.configure({ mode: "default" });

let db: PrismaClient;
const reservations: string[] = [];
const BRAND_PREFIX = "Marca refresco E2E";
const REPLY_PREFIX = "Respuesta refresco E2E";
const ORDER_PREFIX = "ORD-E2E-REFRESCO-";
const COD_RATES = [
  { idRate: 9003, idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: 18074, minimumInsurance: 0, totalCost: 18074, deliveryDays: 3, isCOD: true, codCost: 8391 },
  { idRate: 9004, idCarrier: 2, idProduct: 1, carrier: "COORDINADORA", product: "Normal", flete: 25000, minimumInsurance: 781, totalCost: 25781, deliveryDays: 4, isCOD: true, codCost: 6116 },
];
const FAIR_PREFIX = "E2E Etiquetas";
let startedAt: Date;
let snapshot: { id: string; stock: number; reservedUnits: number; isArchived: boolean }[] = [];

async function signIn(page: Page, path: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Guardar no borra lo abierto",
    redirectUrl: new URL(`/${storeId}${path}`, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

/** Cada paso por separado: un fallo de limpieza no deja a medias el resto. */
async function step(name: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    console.warn(`[refresh-keeps-state] limpieza «${name}» falló:`, error instanceof Error ? error.message : error);
  }
}

/** Las ferias de esta spec (también las de corridas anteriores que se cortaron), con todo lo que cuelga de ellas. */
async function deleteFairs() {
  const fairs = await db.fairEvent.findMany({ where: { storeId, name: { startsWith: FAIR_PREFIX } }, select: { id: true } });
  const fairIds = fairs.map((fair) => fair.id);
  if (fairIds.length === 0) return;
  const items = await db.fairEventInventoryItem.findMany({ where: { fairEventId: { in: fairIds } }, select: { id: true } });
  await step("cápsulas", () => db.fairCapsule.deleteMany({ where: { fairEventId: { in: fairIds } } }));
  await step("piezas de kit", () => db.fairEventKitComponent.deleteMany({ where: { fairEventInventoryItemId: { in: items.map((item) => item.id) } } }));
  await step("inventario de feria", () => db.fairEventInventoryItem.deleteMany({ where: { fairEventId: { in: fairIds } } }));
  await step("movimientos", () => db.inventoryMovement.deleteMany({ where: { storeId, referenceId: { in: fairIds } } }));
  await step("ferias", () => db.fairEvent.deleteMany({ where: { id: { in: fairIds } } }));
}

/** Todo lo que crean estas pruebas, y los dos productos como estaban al empezar. */
async function cleanUp() {
    await deleteFairs();
    await step("redirecciones de marca", async () => {
      const brands = await db.brand.findMany({ where: { storeId, name: { startsWith: BRAND_PREFIX } }, select: { id: true } });
      await db.brandSlugRedirect.deleteMany({ where: { brandId: { in: brands.map((brand) => brand.id) } } });
    });
    await step("marcas", () => db.brand.deleteMany({ where: { storeId, name: { startsWith: BRAND_PREFIX } } }));
    // Corridas anteriores de la versión e2e del caso del bot (ahora es una prueba de componente).
    await step("respuestas del bot", () => db.whatsAppBotReply.deleteMany({ where: { storeId, label: { startsWith: REPLY_PREFIX } } }));
    await step("pedidos", async () => {
      const orders = await db.order.findMany({ where: { storeId, orderNumber: { startsWith: ORDER_PREFIX } }, select: { id: true } });
      const ids = orders.map((order) => order.id);
      if (ids.length === 0) return;
      await db.inventoryMovement.deleteMany({ where: { referenceId: { in: ids } } });
      await db.shipping.deleteMany({ where: { orderId: { in: ids } } });
      await db.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
      await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await db.order.deleteMany({ where: { id: { in: ids } } });
    });
    await step("eventos de reserva", () => db.stockReservationEvent.deleteMany({ where: { reservationId: { in: reservations } } }));
    await step("líneas de reserva", () => db.stockReservationItem.deleteMany({ where: { reservationId: { in: reservations } } }));
    await step("reservas", () => db.stockReservation.deleteMany({ where: { id: { in: reservations } } }));
    await step("movimientos de los productos", () => db.inventoryMovement.deleteMany({ where: { storeId, productId: { in: [FAIR_PRODUCT, RESERVE_PRODUCT] }, createdAt: { gte: startedAt } } }));
    for (const product of snapshot) {
      await step(`producto ${product.id}`, () => db.product.update({ where: { id: product.id }, data: { stock: product.stock, reservedUnits: product.reservedUnits, isArchived: product.isArchived } }));
    }
}

test.describe("guardar no borra lo que está abierto", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("refresh-keeps-state");
    startedAt = new Date();
    await deleteFairs();
    snapshot = await db.product.findMany({ where: { id: { in: [FAIR_PRODUCT, RESERVE_PRODUCT] } }, select: { id: true, stock: true, reservedUnits: true, isArchived: true } });
    await db.product.update({ where: { id: RESERVE_PRODUCT }, data: { isArchived: false, stock: 12, reservedUnits: 0 } });
  });

  // Después de cada prueba, también si falla: la siguiente encuentra la tienda de pruebas como estaba.
  test.afterEach(async () => {
    if (!db) return;
    await cleanUp();
    await step("producto de reserva activo", () => db.product.update({ where: { id: RESERVE_PRODUCT }, data: { isArchived: false, stock: 12, reservedUnits: 0 } }));
  });

  // Al final, el estado original de los productos (el de reserva vuelve a archivarse).
  test.afterAll(async () => {
    if (!db) return;
    await cleanUp();
    await db.$disconnect();
  });

  test("feria: después de «Crear QR» las etiquetas listas siguen ahí, también tras recargar", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, "/ferias");
    await expect(page).toHaveURL(new RegExp(`/${storeId}/ferias(?:\\?.*)?$`), { timeout: 90_000 });
    const fairName = `${FAIR_PREFIX} ${Date.now()}`;
    const formTitle = page.getByRole("heading", { name: "Nueva feria" });
    await expect(async () => {
      await page.getByRole("button", { name: "Nueva feria" }).first().click();
      await expect(formTitle).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await page.getByLabel("Nombre", { exact: true }).fill(fairName);
    await page.getByLabel("Lugar", { exact: true }).fill("Prueba automatizada");
    await Promise.all([page.waitForURL(new RegExp(`/${storeId}/ferias/[^/?]+$`), { timeout: 60_000 }), page.getByRole("button", { name: "Crear feria" }).click()]);
    await expect(page.getByRole("heading", { name: fairName })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("combobox", { name: "Producto para reservar" }).click();
    const productDialog = page.getByRole("dialog", { name: "Producto para reservar" });
    await productDialog.getByRole("combobox").fill("E2E-FAIR-PRODUCT");
    await productDialog.getByRole("option", { name: /Producto feria E2E/ }).click();
    await page.getByLabel("Cantidad para reservar", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Agregar" }).click();
    await page.getByRole("button", { name: "Reservar en inventario" }).click();
    await expect(page.getByText("2 unidades ya están reservadas para esta feria.")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("combobox", { name: "Producto reservado para la cápsula" }).click();
    await page.getByRole("option", { name: /Producto feria E2E/ }).first().click();
    await page.getByRole("spinbutton", { name: "Cantidad de cápsulas" }).fill("1");
    await page.getByLabel("Precio de venta").fill("50000");
    await page.getByRole("button", { name: "Crear QR" }).click();
    await expect(page.getByText("Cápsulas empacadas", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

    // Lo que importa: tras el refresco que sigue al empaque, el único botón para imprimir sigue en pantalla.
    await page.waitForTimeout(4000);
    await expect(page.getByText("Etiquetas listas", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimir etiquetas" })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Imprimir etiquetas" })).toBeVisible({ timeout: 60_000 });
  });

  test("configuración › tienda: guardar «Correos» no borra lo escrito en «Datos del negocio»", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "/configuracion");
    const city = page.getByLabel("Ciudad del negocio");
    await expect(city).toBeVisible({ timeout: 90_000 });
    // En desarrollo lo escrito antes de hidratar se pierde y el primer clic no hace nada.
    await page.waitForLoadState("networkidle");
    const typed = `Ciudad sin guardar ${Date.now()}`;
    await expect(async () => {
      await city.fill(typed);
      await expect(city).toHaveValue(typed, { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    const recipients = page.getByLabel("Correos que reciben los avisos del panel");
    const original = await recipients.inputValue();
    await recipients.fill(original ? `${original}\ne2e-avisos@ejemplo.test` : "e2e-avisos@ejemplo.test");
    const saved = page.waitForResponse((response) => response.url().includes("/settings/emails") && response.request().method() === "PATCH", { timeout: 60_000 });
    await page.getByRole("button", { name: "Guardar correos" }).click();
    expect((await saved).status()).toBe(200);
    await page.waitForTimeout(4000);
    await expect(city).toHaveValue(typed);
    // Deja la lista como estaba.
    await recipients.fill(original);
    const restored = page.waitForResponse((response) => response.url().includes("/settings/emails") && response.request().method() === "PATCH", { timeout: 60_000 });
    await page.getByRole("button", { name: "Guardar correos" }).click();
    expect((await restored).status()).toBe(200);
  });

  test("marca: «Cambiar dirección» no borra lo escrito en el formulario", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const brand = await db.brand.create({ data: { storeId, name: `${BRAND_PREFIX} ${stamp}`, slug: `marca-refresco-e2e-${stamp}`, aliases: [] } });
    await signIn(page, `/marcas/${brand.id}`);
    const manufacturer = page.getByLabel("Fabricante");
    await expect(manufacturer).toBeVisible({ timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    await manufacturer.fill("Fabricante sin guardar");
    await page.getByRole("button", { name: "Cambiar dirección" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Cambiar dirección" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Nueva dirección").fill(`marca-refresco-e2e-nueva-${stamp}`);
    const changed = page.waitForResponse((response) => response.url().includes(brand.id) && response.request().method() === "POST", { timeout: 60_000 });
    await dialog.getByRole("button", { name: "Cambiar dirección" }).click();
    expect((await changed).status()).toBe(200);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(4000);
    await expect(page.getByText(`/marcas/marca-refresco-e2e-nueva-${stamp}`).first()).toBeVisible();
    await expect(manufacturer).toHaveValue("Fabricante sin guardar");
  });

  test("pedido: «Guardar y crear guía» no cierra la confirmación mientras la guía se pide", async ({ page }) => {
    test.setTimeout(240_000);
    const order = await db.order.create({
      data: {
        storeId,
        orderNumber: `${ORDER_PREFIX}${Date.now()}`,
        status: "PENDING",
        type: "STANDARD",
        source: "STORE",
        fullName: "Clienta Guía Refresco",
        email: "clienta@prueba.test",
        phone: "+573001234567",
        address: "Calle 1 # 2-3",
        neighborhood: "Centro",
        city: "La Dorada",
        department: "Caldas",
        daneCode: "17380000",
        subtotal: 10000,
        total: 10000,
        orderItems: { create: [{ productId: FAIR_PRODUCT, name: "Producto feria E2E", quantity: 1, price: 10000 }] },
        payment: { create: { storeId, method: "COD" } },
        shipping: { create: { storeId, provider: "ENVIOCLICK", status: "Preparing", isCOD: true } },
      },
    });
    await page.route("**/api/*/shipment/quote", (route) =>
      route.fulfill({ json: { success: true, quotes: COD_RATES, daneCode: "17380000", packageDimensions: { weight: 1, height: 10, width: 20, length: 25, type: "box", size: "S" } } }),
    );
    // La guía tarda: ese es el momento en que antes se cerraba la confirmación. Nunca llega a EnvioClick.
    let guideRequests = 0;
    await page.route("**/shipping/create-guide", async (route) => {
      guideRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route.fulfill({ json: { data: { tracker: "E2E-TRACKER-1" } } });
    });

    await signIn(page, `/pedidos/${order.id}`);
    await expect(page.locator('label[for="rate-9003"]')).toBeVisible({ timeout: 120_000 });
    await page.waitForLoadState("networkidle");
    await page.locator('label[for="rate-9003"]').click();
    const guideButton = page.getByRole("button", { name: /Guardar y crear guía/ });
    await expect(guideButton).toBeEnabled();
    await guideButton.click();
    const confirm = page.getByRole("dialog", { name: "Crear la guía de envío" });
    await expect(confirm).toBeVisible();
    const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/orders/${order.id}`), { timeout: 120_000 });
    await confirm.getByRole("button", { name: "Sí, crear la guía" }).click();
    expect((await saved).status()).toBe(200);
    // Guardado el pedido, la guía sigue pidiéndose: la confirmación tiene que seguir abierta.
    await expect.poll(() => guideRequests, { timeout: 30_000 }).toBe(1);
    await page.waitForTimeout(2500);
    await expect(confirm).toBeVisible();
    await expect(page.getByText("Guía creada", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    expect(guideRequests).toBe(1);
  });

  test("reserva: guardar la cantidad de una línea no borra lo escrito en la otra", async ({ page }) => {
    test.setTimeout(180_000);
    const reservation = await db.stockReservation.create({
      data: {
        storeId,
        customerName: "Clienta refresco",
        customerPhone: "3009990001",
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
        items: {
          create: [
            { storeId, productId: FAIR_PRODUCT, quantity: 1 },
            { storeId, productId: RESERVE_PRODUCT, quantity: 1 },
          ],
        },
      },
    });
    reservations.push(reservation.id);
    await db.product.update({ where: { id: RESERVE_PRODUCT }, data: { reservedUnits: { increment: 1 } } });
    await db.product.update({ where: { id: FAIR_PRODUCT }, data: { reservedUnits: { increment: 1 } } });

    await signIn(page, `/reservas/${reservation.id}`);
    const lines = page.getByTestId("reservation-line");
    await expect(lines).toHaveCount(2, { timeout: 90_000 });
    const fairLine = lines.filter({ hasText: "Producto feria E2E" });
    const otherLine = lines.filter({ hasNotText: "Producto feria E2E" });
    const otherQuantity = otherLine.getByRole("spinbutton");
    const fairQuantity = fairLine.getByRole("spinbutton");
    // En modo desarrollo la página tarda en hidratarse: se reintenta hasta que el botón cambie la cantidad.
    await expect(async () => {
      if ((await otherQuantity.inputValue()) === "1") await otherLine.getByRole("button", { name: "Aumentar cantidad" }).click();
      await expect(otherQuantity).toHaveValue("2", { timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await otherLine.getByRole("button", { name: "Aumentar cantidad" }).click();
    await expect(otherQuantity).toHaveValue("3");
    await expect(otherLine.getByRole("button", { name: "Guardar" })).toBeVisible();
    await fairLine.getByRole("button", { name: "Aumentar cantidad" }).click();
    await expect(fairQuantity).toHaveValue("2");
    // El guardado vuelve a leer la página (antes con router.refresh, que pide el árbol RSC): se espera esa lectura.
    const reread = page.waitForResponse((response) => response.url().includes(reservation.id) && response.request().method() === "GET" && response.status() === 200, { timeout: 60_000 });
    await fairLine.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cantidad guardada", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await db.stockReservationItem.findFirstOrThrow({ where: { reservationId: reservation.id, productId: FAIR_PRODUCT } })).quantity).toBe(2);
    await reread;
    await expect(fairLine.getByText(/Se pueden reservar/)).toBeVisible();
    // Lo que importa: la otra línea conserva lo escrito sin guardar, con su botón.
    await page.waitForTimeout(2000);
    await expect(otherQuantity).toHaveValue("3");
    await expect(otherLine.getByRole("button", { name: "Guardar" })).toBeVisible();
  });
});
