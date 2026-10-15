import { createClerkClient } from "@clerk/backend";
import type { PrismaClient } from "@prisma/client";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Contra entrega en La Dorada (ORD-1791998787841-915, 2026-10-15): con el
 * pedido pendiente, el envío contra entrega y sin tarifa guardada, Paula
 * cotiza, elige ENVIA con recaudo y pulsa «Guardar cambios»: la tarifa tiene
 * que quedar guardada (idRate, precio, contra entrega). EnvioClick se dobla
 * con las cuatro tarifas que devolvió en producción a las 21:10:26 UTC.
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);

const RATES = [
  { idRate: 9001, idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: 16500, minimumInsurance: 0, totalCost: 16500, deliveryDays: 3, isCOD: false, codCost: null },
  { idRate: 9002, idCarrier: 2, idProduct: 1, carrier: "COORDINADORA", product: "Normal", flete: 19000, minimumInsurance: 500, totalCost: 19500, deliveryDays: 4, isCOD: false, codCost: null },
  { idRate: 9003, idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: 18074, minimumInsurance: 0, totalCost: 18074, deliveryDays: 3, isCOD: true, codCost: 8391 },
  { idRate: 9004, idCarrier: 2, idProduct: 1, carrier: "COORDINADORA", product: "Normal", flete: 25000, minimumInsurance: 781, totalCost: 25781, deliveryDays: 4, isCOD: true, codCost: 6116 },
];

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let orderId = "";

test.describe("guardar la tarifa contra entrega", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("cod-rate-save");
    const order = await db.order.create({
      data: {
        storeId,
        orderNumber: `ORD-E2E-COD-${Date.now()}`,
        status: "PENDING",
        type: "STANDARD",
        source: "STORE",
        fullName: "Clienta Contra Entrega",
        email: "clienta@prueba.test",
        phone: "+573001234567",
        address: "Calle 1 # 2-3",
        neighborhood: "Centro",
        city: "La Dorada",
        department: "Caldas",
        daneCode: "17380000",
        subtotal: 10000,
        total: 10000,
        orderItems: { create: [{ productId: "e2e-fair-product", name: "Producto feria E2E", quantity: 1, price: 10000 }] },
        payment: { create: { storeId, method: "COD" } },
        shipping: {
          create: {
            storeId,
            provider: "ENVIOCLICK",
            status: "Preparing",
            isCOD: true,
            guideError: "La cotización de envío ha expirado o es inválida. Error: Este no es un idRate válido para COD.",
            guideAttemptedAt: new Date(Date.now() - 3 * 3600_000),
          },
        },
      },
    });
    orderId = order.id;
  });

  test.afterAll(async () => {
    if (!db) return;
    if (orderId) {
      await db.inventoryMovement.deleteMany({ where: { referenceId: orderId } });
      await db.shipping.deleteMany({ where: { orderId } });
      await db.paymentDetails.deleteMany({ where: { orderId } });
      await db.orderItem.deleteMany({ where: { orderId } });
      await db.order.deleteMany({ where: { id: orderId } });
    }
    await db.$disconnect();
  });

  test("elegir ENVIA con recaudo y «Guardar cambios» guarda la tarifa", async ({ page }) => {
    test.setTimeout(240_000);
    const quoteBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/*/shipment/quote", async (route) => {
      quoteBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true, quotes: RATES, daneCode: "17380000", packageDimensions: { weight: 1, height: 10, width: 20, length: 25, type: "box", size: "S" } } });
    });

    const clerk = createClerkClient({ secretKey: clerkSecretKey! });
    const task = await clerk.agentTasks.create({
      onBehalfOf: { userId: clerkUserId! },
      permissions: "*",
      agentName: "pdepapel-admin-e2e",
      taskDescription: "Guardar tarifa contra entrega",
      redirectUrl: new URL(`/${storeId}/pedidos/${orderId}`, baseURL).toString(),
      sessionMaxDurationInSeconds: 300,
    });
    await page.goto(task.url, { waitUntil: "domcontentloaded" });

    // Solo se ofrecen las dos tarifas que recaudan, cada una con su recaudo.
    await expect(page.locator('label[for="rate-9003"]')).toContainText("recaudo", { timeout: 120_000 });
    await expect(page.locator('label[for="rate-9001"]')).toHaveCount(0);
    expect(quoteBodies.every((body) => body.isCOD === true)).toBe(true);
    await page.locator('label[for="rate-9003"]').click();
    await expect(page.getByTestId("envioclick-total")).toContainText("26.465");
    await expect(page.getByRole("button", { name: /Guardar y crear guía/ })).toBeEnabled();

    const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/orders/${orderId}`), { timeout: 120_000 });
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    expect((await saved).status()).toBe(200);

    const shipping = await db.shipping.findFirstOrThrow({ where: { orderId } });
    expect(shipping).toMatchObject({ envioClickIdRate: 9003, carrierName: "ENVIA", cost: 18074, isCOD: true });

  });
});
