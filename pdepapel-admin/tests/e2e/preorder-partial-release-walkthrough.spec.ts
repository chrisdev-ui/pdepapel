import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import {
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
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
 * Llegó menos de lo vendido, botón por botón en la página servida (build de
 * producción, base local de pruebas):
 *
 * 1. 1280: en Preventas, «Liberar» está apagado y «Liberar lo que llegó (3)»
 *    explica el reparto (2 + 1 salen, el otro de 2 queda «sin unidad»); al
 *    confirmar, la campaña se cierra y el aviso lleva a Pedidos → «Preventa
 *    sin unidad».
 * 2. 390: el pedido «sin unidad» muestra la lista de pasos; cancelarlo pide
 *    la cuenta de la plata (sin «Retenido»), no deja confirmar si no suma y
 *    anota devuelto + saldo a favor en el historial.
 * 3. 1280: un pedido que sí salió se cancela reteniendo el anticipo (nunca
 *    más) y Preventas suma lo devuelto, lo retenido y el saldo a favor.
 *
 *   npm run test:e2e:prod -- tests/e2e/preorder-partial-release-walkthrough.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/liberar-a-medias-shots");
const TEMPLATE = "e2e-fair-product";
const PRICE = 160000;
const DEPOSIT = 30000;
const tag = randomUUID().slice(0, 6);
const PRODUCT = `Calendario a medias ${tag}`;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let productId = "";
let presaleId = "";
const orders: Record<"oldest" | "middle" | "newest", string> = { oldest: "", middle: "", newest: "" };

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
const money = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Recorrido de liberar a medias",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

async function depositPaidOrder(key: keyof typeof orders, units: number, daysAgo: number, installment = 0) {
  const paidAt = new Date(Date.now() - daysAgo * 86_400_000);
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-E2E-MEDIAS-${key}-${tag}`,
      status: OrderStatus.DEPOSIT_PAID,
      type: OrderType.STANDARD,
      paymentPlan: OrderPaymentPlan.DEPOSIT,
      depositAmount: DEPOSIT * units,
      depositPaidAt: paidAt,
      fullName: `Clienta Medias ${key}`,
      phone: "+573001112233",
      email: "clienta-medias@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      daneCode: "05001000",
      subtotal: PRICE * units,
      total: PRICE * units,
      orderItems: { create: [{ productId, quantity: units, name: PRODUCT, price: PRICE, sku: `CAL-MED-${key}`, isPreorder: true, presaleId }] },
      payment: { create: { storeId, method: PaymentMethod.BankTransfer } },
      shipping: { create: { storeId, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, cost: 0 } },
      payments: {
        create: [
          { storeId, kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED, amount: DEPOSIT * units, method: PaymentMethod.Bold, paidAt, createdBy: "e2e" },
          ...(installment > 0
            ? [{ storeId, kind: OrderPaymentKind.INSTALLMENT, status: OrderPaymentStatus.APPROVED, amount: installment, method: PaymentMethod.BankTransfer, paidAt, createdBy: "e2e" }]
            : []),
        ],
      },
    },
  });
  orders[key] = order.id;
}

const payments = (orderId: string) => db.orderPayment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

async function openCancel(page: Page) {
  const trigger = page.getByRole("button", { name: "Cancelar preventa" }).filter({ visible: true }).first();
  await expect(trigger).toBeVisible({ timeout: 90_000 });
  await settled(trigger);
  const dialog = page.getByRole("dialog", { name: "Cancelar preventa" });
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await settled(dialog);
  return dialog;
}

test.describe("liberar lo que llegó y cancelar con la cuenta de la plata", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    db = createTestPrismaClient("preorder-partial-release-walkthrough");
    const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
    productId = (
      await db.product.create({
        data: {
          storeId,
          name: PRODUCT,
          slug: `calendario-medias-${tag}`,
          description: "Calendario de prueba.",
          // Llegaron 3; se vendieron 2 + 2 + 1.
          stock: 3,
          price: PRICE,
          acqPrice: 123778,
          sku: `CAL-MED-${tag}`,
          categoryId: template.categoryId,
          sizeId: template.sizeId,
          colorId: template.colorId,
          designId: template.designId,
          isArchived: true,
        },
      })
    ).id;
    presaleId = (
      await db.productPresale.create({
        data: {
          storeId,
          productId,
          status: ProductPresaleStatus.ACTIVE,
          unitLimit: null,
          expectedArrivalAt: null,
          committedUnits: 5,
          paymentMode: PresalePaymentMode.DEPOSIT,
          depositType: PresaleDepositType.FIXED,
          depositValue: DEPOSIT,
          createdBy: "e2e",
        },
      })
    ).id;
    await depositPaidOrder("oldest", 2, 5);
    await depositPaidOrder("middle", 2, 4, 20000);
    await depositPaidOrder("newest", 1, 3);
  });

  test.afterAll(async () => {
    if (!db) return;
    const ids = Object.values(orders).filter(Boolean);
    await db.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderPayment.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderInventoryIssue.deleteMany({ where: { orderId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await db.shipping.deleteMany({ where: { orderId: { in: ids } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.productPresale.deleteMany({ where: { productId } });
    await db.inventoryMovement.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.$disconnect();
  });

  test("1. 1280: «Liberar lo que llegó (3)» reparte, cierra la campaña y lleva a «Preventa sin unidad»", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `/${storeId}/preventas`);
    const card = page.getByRole("listitem").filter({ hasText: PRODUCT }).filter({ visible: true }).first();
    await expect(card).toBeVisible({ timeout: 90_000 });
    await settled(card);
    await expect(card.getByRole("button", { name: "Liberar", exact: true })).toBeDisabled();
    expect(money(await card.textContent())).toMatch(/Faltan 5 unidades por entregar · hay 3 en bodega · pide 2 al proveedor/);

    await card.getByRole("button", { name: "Liberar lo que llegó (3)" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ visible: true }).first();
    await expect(confirm).toBeVisible();
    expect(money(await confirm.textContent())).toMatch(/Salen completos los pedidos más antiguos que caben: 2 pedido\(s\), 3 unidades\. Los otros 1 pedido\(s\) \(2 unidades\) quedan «sin unidad»/);
    await page.screenshot({ path: path.join(SHOTS, "1280-1-confirmar-reparto.png") });
    await confirm.getByRole("button", { name: "Liberar 3" }).click();

    await expect
      .poll(() => db.productPresale.findUniqueOrThrow({ where: { id: presaleId } }).then((row) => row.status), { timeout: 60_000 })
      .toBe(ProductPresaleStatus.RELEASED);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);
    const [middleLine] = await db.orderItem.findMany({ where: { orderId: orders.middle } });
    expect(middleLine.preorderUnfulfilledAt).not.toBeNull();
    expect(middleLine.preorderReleasedAt).toBeNull();

    await expect(card).toContainText("1 pedido sin unidad (2 unidades) por cancelar con su devolución", { timeout: 30_000 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-2-liberada-a-medias.png"), fullPage: true });

    await page.getByRole("link", { name: "cancélalos y anota la devolución" }).click();
    await expect(page).toHaveURL(/vista=sin-unidad/, { timeout: 60_000 });
    await expect(page.getByText(`ORD-E2E-MEDIAS-middle-${tag}`).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(`ORD-E2E-MEDIAS-oldest-${tag}`)).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-3-pedidos-sin-unidad.png"), fullPage: true });
  });

  test("2. 390: el «sin unidad» se cancela devolviendo una parte y dejando el resto a favor; sin «Retenido»", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/pedidos/${orders.middle}`);
    const notice = page.getByTestId("unfulfilled-presale-notice").filter({ visible: true }).first();
    await expect(notice).toBeVisible({ timeout: 90_000 });
    await expect(notice).toContainText("No se retiene nada");

    const dialog = await openCancel(page);
    await expect(dialog.getByText("¿Qué pasa con los $ 80.000 que pagó?", { exact: false })).toBeVisible();
    await expect(dialog.getByLabel("Retenido (anticipo no reembolsable)")).toHaveCount(0);
    const confirmButton = dialog.getByRole("button", { name: "Sí, cancelar preventa" });
    await expect(confirmButton).toBeEnabled();

    await dialog.getByLabel("Devuelto").fill("50000");
    await expect(dialog.getByText("tienen que sumar exactamente lo que pagó", { exact: false })).toBeVisible();
    await expect(confirmButton).toBeDisabled();
    await dialog.getByLabel("Saldo a favor").fill("30000");
    await dialog.getByLabel("Referencia (opcional)").fill("TRX-E2E-1");
    await expect(dialog.getByText("· cuadra", { exact: false })).toBeVisible();
    await expect(confirmButton).toBeEnabled();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-4-cancelar-sin-unidad.png") });
    await confirmButton.click();

    await expect
      .poll(() => db.order.findUniqueOrThrow({ where: { id: orders.middle } }).then((row) => row.status), { timeout: 60_000 })
      .toBe(OrderStatus.CANCELLED);
    const rows = (await payments(orders.middle)).map((payment) => `${payment.kind}:${payment.amount}:${payment.method}`);
    expect(rows).toEqual(["DEPOSIT:60000:Bold", "INSTALLMENT:20000:BankTransfer", "REFUND:50000:BankTransfer", "STORE_CREDIT:30000:Bold"]);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);

    const settledList = page.getByRole("list", { name: "Qué pasó con el dinero al cancelar" }).filter({ visible: true }).first();
    await expect(settledList).toBeVisible({ timeout: 60_000 });
    expect(money(await settledList.textContent())).toMatch(/Devuelto.*Transferencia o Bre-B.*\$ 50\.000.*Saldo a favor.*\$ 30\.000/);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-5-historial-al-cancelar.png"), fullPage: true });
  });

  test("3. 1280: el que salió se cancela reteniendo el anticipo (nunca más) y Preventas lo suma", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `/${storeId}/pedidos/${orders.newest}`);
    const dialog = await openCancel(page);
    const retained = dialog.getByLabel("Retenido (anticipo no reembolsable)");
    await expect(retained).toBeVisible();
    await expect(dialog.getByText("Hasta $ 30.000: solo el anticipo", { exact: false })).toBeVisible();
    const confirmButton = dialog.getByRole("button", { name: "Sí, cancelar preventa" });

    await dialog.getByLabel("Devuelto").fill("0");
    await retained.fill("30001");
    await expect(retained).toHaveAttribute("aria-invalid", "true");
    await expect(confirmButton).toBeDisabled();
    await retained.fill("30000");
    await expect(confirmButton).toBeEnabled();
    await page.screenshot({ path: path.join(SHOTS, "1280-6-cancelar-retenido.png") });
    await confirmButton.click();

    await expect
      .poll(() => db.order.findUniqueOrThrow({ where: { id: orders.newest } }).then((row) => row.status), { timeout: 60_000 })
      .toBe(OrderStatus.CANCELLED);
    expect((await payments(orders.newest)).map((payment) => `${payment.kind}:${payment.amount}`)).toEqual(["DEPOSIT:30000", "RETAINED:30000"]);
    // Su unidad sí se había descontado al liberar: vuelve a bodega.
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(1);

    await page.goto(new URL(`/${storeId}/preventas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Al cancelar pedidos de preventa:", { exact: false })).toBeVisible({ timeout: 90_000 });
    expect(money(await page.getByText("Al cancelar pedidos de preventa:", { exact: false }).textContent())).toMatch(
      /\$ 50\.000 devuelto · \$ 30\.000 retenido \(anticipo no reembolsable\) · \$ 30\.000 como saldo a favor/,
    );
    const card = page.getByRole("listitem").filter({ hasText: PRODUCT }).filter({ visible: true }).first();
    expect(money(await card.textContent())).toMatch(/Cancelados: \$ 50\.000 devuelto · \$ 30\.000 retenido · \$ 30\.000 saldo a favor/);
    await expect(card).not.toContainText("sin unidad");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-7-preventas-totales.png"), fullPage: true });
  });
});
