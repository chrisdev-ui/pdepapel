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
 * Abonos libres en el panel, botón por botón en la página servida (build de
 * producción, base local de pruebas), en 390, 768 y 1280:
 *
 * 1. Un pedido como el …393 (anticipo de $60.000 sobre $30.000 esperados):
 *    «Pagos de la clienta» lo muestra, «Registrar abono» avisa si pasa de lo
 *    que falta y no deja guardarlo, y anota un abono de $20.000 sin tocar el
 *    estado ni el inventario.
 * 2. Pagado todo antes de que llegue: «Saldo pagado» y sin «Registrar abono».
 * 3. Llega: «Liberar», «Marcar saldo recibido» con lo que de verdad falta
 *    ($80.000 + envío) y el pagado completo con saldo $0.
 *
 *   npm run test:e2e:prod -- tests/e2e/preorder-abonos-walkthrough.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/abonos-recorrido-shots");
const TEMPLATE = "e2e-fair-product";
const PRICE = 160000;
const DEPOSIT = 30000;
const tag = randomUUID().slice(0, 6);
const PRODUCT = `Calendario abonos ${tag}`;
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
let productId = "";
let presaleId = "";
const orders: Record<string, string> = {};

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
    taskDescription: "Recorrido de abonos libres",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

/** Pedido con anticipo ya recibido, como lo deja «Marcar anticipo recibido». */
async function depositPaidOrder(key: string, deposits: number[]) {
  const order = await db.order.create({
    data: {
      storeId,
      orderNumber: `ORD-E2E-ABONO-${key}-${tag}`,
      status: OrderStatus.DEPOSIT_PAID,
      type: OrderType.STANDARD,
      paymentPlan: OrderPaymentPlan.DEPOSIT,
      depositAmount: DEPOSIT,
      depositPaidAt: new Date(),
      fullName: `Clienta Abono ${key}`,
      phone: "+573001112233",
      email: "",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      subtotal: PRICE,
      total: PRICE,
      orderItems: { create: [{ productId, quantity: 1, name: PRODUCT, price: PRICE, sku: `CAL-ABO-${key}`, isPreorder: true, presaleId }] },
      payment: { create: { storeId, method: PaymentMethod.BankTransfer } },
      shipping: { create: { storeId, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, cost: 0 } },
      payments: {
        create: deposits.map((amount, index) => ({
          storeId,
          kind: index === 0 ? OrderPaymentKind.DEPOSIT : OrderPaymentKind.INSTALLMENT,
          status: OrderPaymentStatus.APPROVED,
          amount,
          method: PaymentMethod.BankTransfer,
          paidAt: new Date(Date.now() - (deposits.length - index) * 60_000),
          createdBy: "e2e",
        })),
      },
    },
  });
  orders[key] = order.id;
  return order;
}

const payments = (orderId: string) => db.orderPayment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

async function openDialog(page: Page, button: string | RegExp, title: string) {
  const trigger = page.getByRole("button", { name: button }).filter({ visible: true }).first();
  await expect(trigger).toBeVisible({ timeout: 90_000 });
  await settled(trigger);
  const dialog = page.getByRole("dialog", { name: title });
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await settled(dialog);
  return dialog;
}

test.describe("abonos libres en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    db = createTestPrismaClient("preorder-abonos-walkthrough");
    const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
    productId = (
      await db.product.create({
        data: {
          storeId,
          name: PRODUCT,
          slug: `calendario-abonos-${tag}`,
          description: "Calendario de prueba.",
          stock: 0,
          price: PRICE,
          acqPrice: 123778,
          sku: `CAL-ABO-${tag}`,
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
          paymentMode: PresalePaymentMode.DEPOSIT,
          depositType: PresaleDepositType.FIXED,
          depositValue: DEPOSIT,
          createdBy: "e2e",
        },
      })
    ).id;
    for (const viewport of VIEWPORTS) await depositPaidOrder(viewport.name, [60000]);
    await depositPaidOrder("full", [DEPOSIT, PRICE - DEPOSIT]);
  });

  test.afterAll(async () => {
    if (!db) return;
    const ids = (await db.order.findMany({ where: { storeId, orderItems: { some: { productId } } }, select: { id: true } })).map((order) => order.id);
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

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: …393 con «Registrar abono» (tope visible, abono anotado, historial)`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const orderId = orders[viewport.name];
      await signIn(page, `/${storeId}/pedidos/${orderId}`);

      const history = page.getByRole("list", { name: "Historial de pagos" }).filter({ visible: true }).first();
      await expect(history).toBeVisible({ timeout: 90_000 });
      await expect(history.getByRole("listitem")).toHaveCount(1);
      expect(money(await page.getByTestId("payments-summary").filter({ visible: true }).first().textContent())).toMatch(/Pagado \$ 60\.000 de \$ 160\.000 · falta \$ 100\.000 \+ envío/);
      await expect(page.getByRole("button", { name: "Marcar saldo recibido" }).filter({ visible: true }).first()).toBeDisabled();

      const dialog = await openDialog(page, "Registrar abono", "Registrar abono");
      expect(money(await dialog.locator("#preorder-payment-remaining").textContent())).toBe("Falta $ 100.000 + envío.");
      const value = dialog.getByLabel("Valor recibido");
      await value.fill("120000");
      await expect(dialog.getByText("Pasa de lo que falta: el abono puede ser hasta", { exact: false })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Anotar abono" })).toBeDisabled();
      await expect(dialog.getByRole("checkbox", { name: "Avisar a la clienta" })).not.toBeChecked();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-1-abono-tope.png`) });

      await value.fill("20000");
      await expect(dialog.getByRole("button", { name: "Anotar abono" })).toBeEnabled();
      await dialog.getByRole("button", { name: "Anotar abono" }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });

      await expect.poll(async () => (await payments(orderId)).map((payment) => `${payment.kind}:${payment.amount}`), { timeout: 30_000 }).toEqual(["DEPOSIT:60000", "INSTALLMENT:20000"]);
      const after = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(after.status).toBe(OrderStatus.DEPOSIT_PAID);
      expect(after.paidAt).toBeNull();
      expect(await db.inventoryMovement.count({ where: { productId } })).toBe(0);
      expect(await db.orderNotification.count({ where: { orderId, reason: "Abono registrado sin avisar" } })).toBe(1);

      await expect(history.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });
      expect(money(await history.getByRole("listitem").nth(1).textContent())).toMatch(/Abono .*Transferencia o Bre-B.*\$ 20\.000.*Llevas \$ 80\.000/);
      expect(money(await page.getByTestId("payments-summary").filter({ visible: true }).first().textContent())).toMatch(/falta \$ 80\.000 \+ envío/);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-2-historial.png`), fullPage: true });
    });
  }

  test("pagado todo antes de que llegue: «Saldo pagado», sin «Registrar abono»", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/pedidos/${orders.full}`);
    const label = page.getByTestId("saldo-pagado").filter({ visible: true }).first();
    await expect(label).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: "Registrar abono" })).toHaveCount(0);
    expect(money(await page.getByTestId("payments-summary").filter({ visible: true }).first().textContent())).toMatch(/Saldo pagado: al llegar solo falta el envío/);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-3-saldo-pagado.png"), fullPage: true });
  });

  test("llega: «Liberar», saldo con lo que de verdad falta y saldo $0 del pagado completo", async ({ page }) => {
    test.setTimeout(300_000);
    await db.product.update({ where: { id: productId }, data: { stock: 4 } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `/${storeId}/preventas`);
    const card = page.getByRole("listitem").filter({ hasText: PRODUCT }).filter({ visible: true }).first();
    await expect(card).toBeVisible({ timeout: 90_000 });
    await settled(card);
    await card.getByRole("button", { name: "Liberar" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ visible: true }).first();
    await confirm.getByRole("button", { name: "Liberar", exact: true }).click();
    await expect
      .poll(() => db.productPresale.findUniqueOrThrow({ where: { id: presaleId } }).then((row) => row.status), { timeout: 60_000 })
      .toBe(ProductPresaleStatus.RELEASED);

    // …393 con abono: falta $80.000. «Pedir saldo» con $12.000 de envío → $92.000 y «Cobrar saldo».
    await page.goto(new URL(`/${storeId}/pedidos/${orders["1280"]}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    let dialog = await openDialog(page, "Pedir saldo", "Pedir saldo");
    await dialog.getByLabel("Envío cotizado").fill("12000");
    expect(money(await dialog.getByTestId("balance-request-preview").textContent())).toMatch(/\$ 92\.000/);
    // Sin correo: no hay aviso por aquí, se manda el enlace por WhatsApp.
    await expect(dialog.getByRole("checkbox", { name: "Avisar a la clienta" })).toBeDisabled();
    await page.screenshot({ path: path.join(SHOTS, "1280-4a-pedir-saldo.png") });
    await dialog.getByRole("button", { name: "Pedir saldo" }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    const collect = await openDialog(page, /Cobrar saldo · \$\s92\.000/, "Cobrar saldo");
    expect(money(await collect.getByTestId("balance-collect-amount").textContent())).toMatch(/\$ 92\.000/);
    await expect(collect.getByText(new RegExp(`/pedido/${orders["1280"]}`))).toBeVisible();
    await expect(collect.getByRole("button", { name: /Copiar mensaje/ })).toBeVisible();
    await expect(collect.getByRole("button", { name: /Copiar enlace/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-4b-cobrar-saldo.png") });
    const requested = await db.order.findUniqueOrThrow({ where: { id: orders["1280"] }, include: { shipping: true } });
    expect({ total: requested.total, requested: requested.balanceRequestedAt !== null, shipping: requested.shipping?.cost }).toEqual({ total: 172000, requested: true, shipping: 12000 });
    await collect.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(collect).toBeHidden();
    // Los tres botones del saldo no aplastan el texto del siguiente paso, ni en el celular ni en la tableta.
    for (const [width, height] of [[390, 844], [768, 1024], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      const step = page.getByRole("region", { name: "Siguiente paso: cobrar el saldo" }).filter({ visible: true }).first();
      await expect(step).toBeVisible();
      const description = step.getByText(/Cotiza el envío y pulsa «Pedir saldo»/);
      expect((await description.boundingBox())!.width).toBeGreaterThan(Math.min(250, width - 120));
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${width}-4c-siguiente-paso.png`) });
    }

    // Le transfirió: «Marcar saldo recibido» ya trae el envío pedido y el saldo exacto.
    dialog = await openDialog(page, "Marcar saldo recibido", "Marcar saldo recibido");
    expect(money(await dialog.getByText("Saldo a recibir:").textContent())).toMatch(/\$ 92\.000/);
    await page.screenshot({ path: path.join(SHOTS, "1280-4-saldo-real.png") });
    await dialog.getByRole("button", { name: "Anotar saldo" }).click();
    await expect
      .poll(() => db.order.findUniqueOrThrow({ where: { id: orders["1280"] } }).then((row) => `${row.status}/${row.paidAt !== null}`), { timeout: 60_000 })
      .toBe(`${OrderStatus.PAID}/true`);
    expect((await payments(orders["1280"])).map((payment) => `${payment.kind}:${payment.amount}`)).toEqual(["DEPOSIT:60000", "INSTALLMENT:20000", "BALANCE:92000"]);

    // Pagado completo antes de llegar: saldo $0 sin envío → pagado, sin fila de saldo.
    await page.goto(new URL(`/${storeId}/pedidos/${orders.full}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    dialog = await openDialog(page, "Marcar saldo recibido", "Marcar saldo recibido");
    expect(money(await dialog.getByText("Saldo a recibir:").textContent())).toMatch(/\$ 0/);
    await dialog.getByRole("button", { name: "Anotar saldo" }).click();
    await expect
      .poll(() => db.order.findUniqueOrThrow({ where: { id: orders.full } }).then((row) => `${row.status}/${row.paidAt !== null}`), { timeout: 60_000 })
      .toBe(`${OrderStatus.PAID}/true`);
    expect((await payments(orders.full)).some((payment) => payment.kind === OrderPaymentKind.BALANCE)).toBe(false);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-5-pagado-completo.png"), fullPage: true });
  });
});
