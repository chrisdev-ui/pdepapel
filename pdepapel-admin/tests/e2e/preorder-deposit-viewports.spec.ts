import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import {
  OrderPaymentPlan,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PreorderWaitlistChannel,
  PresaleDepositType,
  PresalePaymentMode,
  ProductPresaleStatus,
  ShippingProvider,
  ShippingStatus,
  type PrismaClient,
} from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * Preventa con anticipo en el panel, en 390, 768 y 1280: el pedido pendiente
 * dice «verificar el anticipo» y ofrece «Marcar anticipo recibido» (nunca
 * «Marcar como pagado»), con «Avisar a la clienta» apagado; la ficha muestra
 * la preventa con anticipo y la lista de espera; Preventas muestra
 * «Anticipos recibidos». En 1280 se anota el anticipo y el pedido queda
 * «Anticipo recibido» sin fecha de pago. Con la base local de pruebas:
 *
 *   npm run test:e2e:prod -- tests/e2e/preorder-deposit-viewports.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/preventa-anticipo-shots");
const TEMPLATE = "e2e-fair-product";
const PRICE = 160000;
const DEPOSIT = 30000;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let productId = "";
let presaleId = "";
const orders: string[] = [];

async function settled(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate(async (el) => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
          let lowest = 1;
          for (let node: Element | null = el; node; node = node.parentElement) lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
          return lowest;
        }),
      { timeout: 60_000 },
    )
    .toBe(1);
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function depositOrder(width: number) {
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-E2E-ANTICIPO-${width}-${randomUUID().slice(0, 6)}`,
      status: OrderStatus.PENDING,
      type: OrderType.STANDARD,
      paymentPlan: OrderPaymentPlan.DEPOSIT,
      depositAmount: DEPOSIT,
      fullName: `Clienta Anticipo ${width}`,
      phone: "+573001112233",
      email: `anticipo-${width}@prueba.test`,
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      subtotal: PRICE,
      total: PRICE,
      orderItems: { create: [{ productId, quantity: 1, name: "Calendario de prueba e2e", price: PRICE, sku: `CAL-E2E-${width}`, isPreorder: true, presaleId }] },
      payment: { create: { storeId, method: PaymentMethod.BankTransfer } },
      shipping: { create: { storeId, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, cost: 0 } },
    },
  });
  orders.push(order.id);
  return order;
}

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Prueba de la preventa con anticipo",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

test.describe("preventa con anticipo en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    db = createTestPrismaClient("preorder-deposit-viewports");
    const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
    const product = await db.product.create({
      data: {
        storeId,
        name: "Calendario de prueba e2e",
        slug: `calendario-prueba-e2e-${randomUUID().slice(0, 6)}`,
        description: "Calendario de prueba.",
        stock: 0,
        price: PRICE,
        acqPrice: 123778,
        sku: `CAL-E2E-${randomUUID().slice(0, 6)}`,
        categoryId: template.categoryId,
        sizeId: template.sizeId,
        colorId: template.colorId,
        designId: template.designId,
        isArchived: true,
      },
    });
    productId = product.id;
    presaleId = (
      await db.productPresale.create({
        data: {
          storeId,
          productId,
          status: ProductPresaleStatus.ACTIVE,
          unitLimit: null,
          expectedArrivalAt: null,
          paymentMode: PresalePaymentMode.DEPOSIT,
          depositType: PresaleDepositType.FIXED,
          depositValue: DEPOSIT,
          createdBy: "e2e",
        },
      })
    ).id;
    await db.preorderWaitlistEntry.create({
      data: { storeId, productId, presaleId, name: "Clienta Lista E2E", phone: "+573001112233", channel: PreorderWaitlistChannel.WHATSAPP, createdBy: "e2e" },
    });
  });

  test.afterAll(async () => {
    if (!db) return;
    const all = await db.order.findMany({ where: { storeId, orderItems: { some: { productId } } }, select: { id: true } });
    const ids = Array.from(new Set([...orders, ...all.map((order) => order.id)]));
    await db.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderPayment.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await db.shipping.deleteMany({ where: { orderId: { in: ids } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.preorderWaitlistEntry.deleteMany({ where: { productId } });
    await db.productPresale.deleteMany({ where: { productId } });
    await db.inventoryMovement.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.$disconnect();
  });

  for (const viewport of [
    { name: "telefono-390", width: 390, height: 844, confirm: false },
    { name: "tableta-768", width: 768, height: 1024, confirm: false },
    { name: "computador-1280", width: 1280, height: 800, confirm: true },
  ]) {
    test(`pedido, ficha y Preventas en ${viewport.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(SHOTS, { recursive: true });
      const order = await depositOrder(viewport.width);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // El pedido: verificar el anticipo, sin «Marcar como pagado».
      await signIn(page, `/${storeId}/pedidos/${order.id}`);
      const mark = page.getByRole("button", { name: "Marcar anticipo recibido" }).filter({ visible: true }).first();
      await expect(mark).toBeVisible({ timeout: 90_000 });
      await settled(mark);
      await expect(page.getByText("Siguiente paso: verificar el anticipo").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Marcar como pagado" })).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-pedido.png`), fullPage: true });

      const dialog = page.getByRole("dialog", { name: "Marcar anticipo recibido" });
      await expect(async () => {
        await mark.click();
        await expect(dialog).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 60_000 });
      await settled(dialog);
      await expect(dialog.getByRole("checkbox", { name: "Avisar a la clienta" })).not.toBeChecked();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-dialogo.png`) });

      if (viewport.confirm) {
        await dialog.getByRole("button", { name: "Anotar anticipo" }).click();
        await expect
          .poll(async () => {
            const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
            return `${saved.status}/${saved.paidAt === null}`;
          }, { timeout: 60_000 })
          .toBe(`${OrderStatus.DEPOSIT_PAID}/true`);
      } else {
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }

      // La ficha: la preventa con anticipo y la lista de espera.
      await page.goto(new URL(`/${storeId}/productos/${productId}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      // La lista carga sus filas después de pintar el encabezado: se espera la fila antes de desplazarse.
      const entry = page.getByText("Clienta Lista E2E").filter({ visible: true }).first();
      await expect(entry).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole("heading", { name: "Lista de espera" })).toHaveCount(1);
      await entry.scrollIntoViewIfNeeded();
      await settled(entry);
      await expect(page.getByText("Anticipo de", { exact: false }).filter({ visible: true }).first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-3-ficha.png`), fullPage: true });

      // Preventas: los anticipos aparte de lo pagado completo.
      await page.goto(new URL(`/${storeId}/preventas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
      const deposits = page.getByText("Anticipos recibidos").filter({ visible: true }).first();
      await expect(deposits).toBeVisible({ timeout: 90_000 });
      await settled(deposits);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-4-preventas.png`), fullPage: true });
    });
  }
});
