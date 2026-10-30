import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import {
  OrderStatus,
  PreorderWaitlistChannel,
  PreorderWaitlistStatus,
  PresaleDepositType,
  PresalePaymentMode,
  ProductPresaleStatus,
  type PrismaClient,
} from "@prisma/client";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/image-stub";
import { createTestPrismaClient } from "./helpers/test-database";

/**
 * La preventa con anticipo como la usa Paula, botón por botón en la página
 * servida (build de producción, base local de pruebas):
 *
 * 1-2. En la ficha, «Marcar anticipo recibido» en una fila de la lista de
 *      espera (390 y 1280) crea el pedido «Anticipo recibido»: sin fecha de
 *      pago, el cobro anotado, sin inventario, fuera de «Por atender» y de
 *      los ingresos, la fila pasa a «Con anticipo» y la ficha no se guarda.
 * 3.   Estados de la lista: contactada, reabrir, descartar, ver descartadas.
 * 4.   «Abrir preventa» y «Editar preventa» desde la ficha archivada.
 * 5.   En Preventas, «Notificar retraso» y «Cancelar preventa».
 * 6.   Llega la mercancía: «Liberar» y «Marcar saldo recibido».
 *
 *   npm run test:e2e:prod -- tests/e2e/preorder-panel-walkthrough.spec.ts
 */
const baseURL = process.env.E2E_ADMIN_BASE_URL || "http://127.0.0.1:3101";
const storeId = process.env.E2E_ADMIN_STORE_ID || "e2e-admin-store";
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
const configured = Boolean(clerkSecretKey?.startsWith("sk_test_") && clerkUserId);
const SHOTS = path.resolve(__dirname, "../../tmp/preventa-recorrido-shots");
const TEMPLATE = "e2e-fair-product";
const PRICE = 160000;
const DEPOSIT = 30000;
const tag = randomUUID().slice(0, 6);
const DEPOSIT_PRODUCT = `Calendario recorrido ${tag}`;
const OPEN_PRODUCT = `Calendario por abrir ${tag}`;
const LATE_PRODUCT = `Calendario atrasado ${tag}`;

test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

let db: PrismaClient;
const ids = { deposit: "", open: "", late: "", presale: "", latePresale: "" };
const entries: Record<string, string> = {};

/** La página monta el cliente después de pintar: si el nodo se reemplaza a mitad del scroll, se vuelve a intentar. */
async function scrollIntoView(locator: Locator) {
  await expect(async () => {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
  }).toPass({ timeout: 60_000 });
}

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

async function signIn(page: Page, redirectPath: string) {
  const clerk = createClerkClient({ secretKey: clerkSecretKey! });
  const task = await clerk.agentTasks.create({
    onBehalfOf: { userId: clerkUserId! },
    permissions: "*",
    agentName: "pdepapel-admin-e2e",
    taskDescription: "Recorrido de la preventa con anticipo",
    redirectUrl: new URL(redirectPath, baseURL).toString(),
    sessionMaxDurationInSeconds: 300,
  });
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
}

async function createProduct(name: string) {
  const template = await db.product.findUniqueOrThrow({ where: { id: TEMPLATE } });
  return (
    await db.product.create({
      data: {
        storeId,
        name,
        slug: `${name.toLowerCase().replace(/\s+/g, "-")}`,
        description: "Calendario de prueba.",
        stock: 0,
        price: PRICE,
        acqPrice: 123778,
        sku: `CAL-REC-${randomUUID().slice(0, 6)}`,
        categoryId: template.categoryId,
        sizeId: template.sizeId,
        colorId: template.colorId,
        designId: template.designId,
        isArchived: true,
      },
    })
  ).id;
}

/** La fila de la lista de espera con ese nombre. */
const waitlistRow = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true }).first();

/** La tarjeta de Preventas de ese producto. */
const presaleCard = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true }).first();

async function confirmAction(page: Page, label: string) {
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ visible: true }).first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

/** Las pestañas de Pedidos buscando el número: cuántos hay en «Por atender» y en «Todos». */
async function porAtender(page: Page, orderNumber: string, shotName: string) {
  await page.goto(new URL(`/${storeId}/pedidos?vista=por-atender&q=${encodeURIComponent(orderNumber)}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
  const tabs = page.getByRole("tablist", { name: "Colas de pedidos" });
  const all = tabs.getByRole("tab", { name: /^Todos \d+$/ });
  await expect(all).toHaveText(/Todos\s*1$/, { timeout: 90_000 });
  const label = (await tabs.getByRole("tab", { name: /^Por atender \d+$/ }).textContent()) ?? "";
  await page.screenshot({ path: path.join(SHOTS, `${shotName}.png`), fullPage: true });
  return { porAtender: Number(label.match(/(\d+)\s*$/)?.[1] ?? NaN), todos: 1 };
}

async function depositFromWaitlist(page: Page, width: number, height: number, name: string) {
  await page.setViewportSize({ width, height });
  await signIn(page, `/${storeId}/productos/${ids.deposit}`);
  const row = waitlistRow(page, name);
  await expect(row).toBeVisible({ timeout: 90_000 });
  await scrollIntoView(row);
  await settled(row);
  const before = await db.product.findUniqueOrThrow({ where: { id: ids.deposit }, select: { updatedAt: true, stock: true } });

  const dialog = page.getByRole("dialog", { name: "Marcar anticipo recibido" });
  await expect(async () => {
    await row.getByRole("button", { name: "Marcar anticipo recibido" }).click();
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await settled(dialog);
  await expect(dialog.getByLabel("Unidades")).toHaveValue("1");
  await expect(dialog.getByLabel("Valor recibido")).toHaveValue(/30[.,]000/);
  await expect(dialog.getByRole("checkbox", { name: "Avisar a la clienta" })).not.toBeChecked();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SHOTS, `${width}-1-dialogo-lista.png`) });
  await dialog.getByRole("button", { name: "Anotar anticipo" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // La fila pasa a «Con anticipo» en la misma página, sin recargar.
  await expect(row.getByText("Con anticipo")).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole("button", { name: "Marcar anticipo recibido" })).toHaveCount(0);

  const entry = await db.preorderWaitlistEntry.findUniqueOrThrow({ where: { id: entries[name] } });
  expect(entry.status).toBe(PreorderWaitlistStatus.CONVERTED);
  expect(entry.orderId).toBeTruthy();
  const order = await db.order.findUniqueOrThrow({
    where: { id: entry.orderId! },
    include: { payments: true, orderItems: true, shipping: true },
  });
  expect(order.status).toBe(OrderStatus.DEPOSIT_PAID);
  expect(order.paidAt).toBeNull();
  expect(Number(order.depositAmount)).toBe(DEPOSIT);
  expect(order.total).toBe(PRICE);
  expect(order.fullName).toBe(name);
  expect(order.payments.map((payment) => [payment.kind, payment.amount])).toEqual([["DEPOSIT", DEPOSIT]]);
  expect(order.orderItems).toHaveLength(1);
  expect(order.orderItems[0]).toMatchObject({ productId: ids.deposit, quantity: 1, isPreorder: true, presaleId: ids.presale });
  // No es venta: fuera de lo que cuenta como ingreso (PAID/SENT) y sin aviso a la clienta.
  expect([OrderStatus.PAID, OrderStatus.SENT]).not.toContain(order.status);
  expect(await db.orderNotification.count({ where: { orderId: order.id, status: "SENT" } })).toBe(0);
  expect(await db.inventoryMovement.count({ where: { productId: ids.deposit } })).toBe(0);
  const after = await db.product.findUniqueOrThrow({ where: { id: ids.deposit }, select: { updatedAt: true, stock: true } });
  expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  expect(after.stock).toBe(before.stock);
  await page.screenshot({ path: path.join(SHOTS, `${width}-2-ficha-con-anticipo.png`), fullPage: true });
  return order;
}

test.describe("recorrido de la preventa con anticipo en el panel", () => {
  test.skip(!configured, "Define claves de prueba de Clerk y E2E_ADMIN_CLERK_USER_ID.");

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    db = createTestPrismaClient("preorder-panel-walkthrough");
    ids.deposit = await createProduct(DEPOSIT_PRODUCT);
    ids.open = await createProduct(OPEN_PRODUCT);
    ids.late = await createProduct(LATE_PRODUCT);
    ids.presale = (
      await db.productPresale.create({
        data: {
          storeId,
          productId: ids.deposit,
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
    ids.latePresale = (
      await db.productPresale.create({
        data: {
          storeId,
          productId: ids.late,
          status: ProductPresaleStatus.ACTIVE,
          unitLimit: 10,
          expectedArrivalAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          paymentMode: PresalePaymentMode.DEPOSIT,
          depositType: PresaleDepositType.FIXED,
          depositValue: DEPOSIT,
          createdBy: "e2e",
        },
      })
    ).id;
    for (const [name, contact] of [
      ["Clienta Anticipo 390", { phone: "+573001112233" }],
      ["Clienta Anticipo 1280", { phone: "+573001112233" }],
      ["Clienta Estados", { handle: "@clienta_estados_e2e" }],
    ] as const) {
      entries[name] = (
        await db.preorderWaitlistEntry.create({
          data: { storeId, productId: ids.deposit, presaleId: ids.presale, name, ...contact, channel: PreorderWaitlistChannel.WHATSAPP, createdBy: "e2e" },
        })
      ).id;
    }
  });

  test.afterAll(async () => {
    if (!db) return;
    const products = [ids.deposit, ids.open, ids.late].filter(Boolean);
    const orders = (await db.order.findMany({ where: { storeId, orderItems: { some: { productId: { in: products } } } }, select: { id: true } })).map((order) => order.id);
    await db.orderNotification.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderPayment.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.shipping.deleteMany({ where: { orderId: { in: orders } } });
    await db.paymentDetails.deleteMany({ where: { orderId: { in: orders } } });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.preorderWaitlistEntry.deleteMany({ where: { productId: { in: products } } });
    await db.productPresale.deleteMany({ where: { productId: { in: products } } });
    await db.inventoryMovement.deleteMany({ where: { productId: { in: products } } });
    await db.product.deleteMany({ where: { id: { in: products } } });
    await db.$disconnect();
  });

  test("1. teléfono 390: «Marcar anticipo recibido» en la fila de la lista de espera", async ({ page }) => {
    test.setTimeout(300_000);
    const order = await depositFromWaitlist(page, 390, 844, "Clienta Anticipo 390");
    expect(await porAtender(page, order.orderNumber, "390-3-por-atender")).toEqual({ porAtender: 0, todos: 1 });
  });

  test("2. computador 1280: el segundo anticipo, «Anticipos recibidos» y fuera de «Por atender»", async ({ page }) => {
    test.setTimeout(300_000);
    const order = await depositFromWaitlist(page, 1280, 800, "Clienta Anticipo 1280");
    expect(await porAtender(page, order.orderNumber, "1280-3-por-atender")).toEqual({ porAtender: 0, todos: 1 });

    await page.goto(new URL(`/${storeId}/preventas`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    const card = presaleCard(page, DEPOSIT_PRODUCT);
    await expect(card).toBeVisible({ timeout: 90_000 });
    await settled(card);
    await expect(card).toContainText("2");
    // Lo que Paula le pide al proveedor: lo que falta menos lo que ya hay en bodega.
    await expect(card).toContainText("Faltan 2 unidades por entregar · hay 0 en bodega · pide 2 al proveedor");
    const received = await db.orderPayment.aggregate({ where: { order: { orderItems: { some: { productId: ids.deposit } } } }, _sum: { amount: true } });
    expect(Number(received._sum.amount)).toBe(2 * DEPOSIT);
    await expect(page.getByText("Anticipos recibidos").filter({ visible: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "1280-3-preventas.png"), fullPage: true });
  });

  test("3. estados de la lista: contactada, reabrir, descartar y ver descartadas", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/productos/${ids.deposit}`);
    const name = "Clienta Estados";
    const row = waitlistRow(page, name);
    await expect(row).toBeVisible({ timeout: 90_000 });
    await scrollIntoView(row);
    await settled(row);
    const before = await db.product.findUniqueOrThrow({ where: { id: ids.deposit }, select: { updatedAt: true } });
    const status = () => db.preorderWaitlistEntry.findUniqueOrThrow({ where: { id: entries[name] } }).then((entry) => entry.status);

    await row.getByRole("button", { name: "Marcar contactada" }).click();
    await expect(row.getByText("Contactada")).toBeVisible({ timeout: 30_000 });
    await expect.poll(status).toBe(PreorderWaitlistStatus.CONTACTED);

    await row.getByRole("button", { name: "Reabrir" }).click();
    await expect(row.getByText("Esperando")).toBeVisible({ timeout: 30_000 });
    await expect.poll(status).toBe(PreorderWaitlistStatus.WAITING);

    await row.getByRole("button", { name: "Descartar" }).click();
    await expect.poll(status).toBe(PreorderWaitlistStatus.DISCARDED);
    await expect(page.getByText(name).filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });

    await page.getByRole("button", { name: "Ver descartadas (1)" }).click();
    const discarded = waitlistRow(page, name);
    await expect(discarded.getByText("Descartada")).toBeVisible({ timeout: 30_000 });
    await discarded.getByRole("button", { name: "Reabrir" }).click();
    await expect.poll(status).toBe(PreorderWaitlistStatus.WAITING);

    const after = await db.product.findUniqueOrThrow({ where: { id: ids.deposit }, select: { updatedAt: true } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-4-estados-lista.png"), fullPage: true });
  });

  test("4. «Abrir preventa» en 390 y «Editar preventa» en 1280 desde la ficha archivada", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/productos/${ids.open}`);
    const line = page.getByTestId("presale-open-first");
    await expect(line).toBeVisible({ timeout: 90_000 });
    await scrollIntoView(line);
    await settled(line);
    const before = await db.product.findUniqueOrThrow({ where: { id: ids.open }, select: { updatedAt: true, isArchived: true, stock: true } });

    await page.getByRole("checkbox", { name: "Sin tope de unidades" }).click();
    await page.getByRole("checkbox", { name: "Con anticipo" }).click();
    await page.getByLabel("Anticipo por unidad (pesos)").fill(String(DEPOSIT));
    await page.getByLabel("Días para pagar el saldo").fill("5");
    await page.getByRole("button", { name: "Abrir preventa" }).click();

    await expect.poll(() => db.productPresale.count({ where: { productId: ids.open, status: ProductPresaleStatus.ACTIVE } }), { timeout: 30_000 }).toBe(1);
    const presale = await db.productPresale.findFirstOrThrow({ where: { productId: ids.open } });
    expect(presale).toMatchObject({ paymentMode: PresalePaymentMode.DEPOSIT, depositType: PresaleDepositType.FIXED, unitLimit: null, balanceDueDays: 5 });
    expect(Number(presale.depositValue)).toBe(DEPOSIT);
    await expect(page.getByRole("heading", { name: "Lista de espera" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("presale-open-first")).toHaveCount(0);
    const afterOpen = await db.product.findUniqueOrThrow({ where: { id: ids.open }, select: { updatedAt: true, isArchived: true, stock: true } });
    expect(afterOpen).toEqual(before);
    expect(await db.inventoryMovement.count({ where: { productId: ids.open } })).toBe(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-5-preventa-abierta.png"), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Editar preventa" }).click();
    await page.getByLabel("Fecha aproximada en texto").fill("Primera semana de diciembre");
    await page.getByRole("button", { name: "Guardar preventa" }).click();
    await expect
      .poll(() => db.productPresale.findFirstOrThrow({ where: { productId: ids.open } }).then((row) => row.expectedArrivalText), { timeout: 30_000 })
      .toBe("Primera semana de diciembre");
    expect(await db.productPresale.count({ where: { productId: ids.open } })).toBe(1);
    const afterEdit = await db.product.findUniqueOrThrow({ where: { id: ids.open }, select: { updatedAt: true, isArchived: true, stock: true } });
    expect(afterEdit).toEqual(before);
    await page.screenshot({ path: path.join(SHOTS, "1280-6-preventa-editada.png"), fullPage: true });
  });

  test("5. Preventas: «Notificar retraso» (sin clientas lo dice; con una lo anota) y «Cancelar preventa»", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/${storeId}/preventas`);
    const late = presaleCard(page, LATE_PRODUCT);
    await expect(late).toBeVisible({ timeout: 90_000 });
    await scrollIntoView(late);
    await settled(late);
    const delayNotified = () => db.productPresale.findUniqueOrThrow({ where: { id: ids.latePresale } }).then((row) => row.delayNotifiedAt !== null);

    // Botones de 44 px en el teléfono.
    for (const name of ["Notificar retraso", "Liberar"]) {
      const box = await late.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // Nadie esperando: el mensaje del servidor se ve y no se anota nada.
    await late.getByRole("button", { name: "Notificar retraso" }).click();
    await confirmAction(page, "Anotar aviso");
    await expect(page.getByText("Esta preventa no tiene clientas esperando", { exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    expect(await delayNotified()).toBe(false);

    // Una clienta con anticipo: ahora sí queda anotado.
    await db.order.create({
      data: {
        storeId,
        orderNumber: `ORD-E2E-RETRASO-${tag}`,
        status: OrderStatus.DEPOSIT_PAID,
        type: "STANDARD",
        paymentPlan: "DEPOSIT",
        depositAmount: DEPOSIT,
        fullName: "Clienta Retraso E2E",
        phone: "+573001112233",
        email: "retraso@prueba.test",
        subtotal: PRICE,
        total: PRICE,
        orderItems: { create: [{ productId: ids.late, quantity: 1, name: LATE_PRODUCT, price: PRICE, sku: "CAL-E2E-RETRASO", isPreorder: true, presaleId: ids.latePresale }] },
      },
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(late).toBeVisible({ timeout: 90_000 });
    await settled(late);
    await late.getByRole("button", { name: "Notificar retraso" }).click();
    await confirmAction(page, "Anotar aviso");
    await expect.poll(delayNotified, { timeout: 30_000 }).toBe(true);
    await expect(late.getByText("Retraso avisado el", { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(await db.inventoryMovement.count({ where: { productId: ids.late } })).toBe(0);
    await page.screenshot({ path: path.join(SHOTS, "390-7-preventas-retraso.png"), fullPage: true });

    // Cancelar: la preventa abierta en el paso 4, sin pedidos esperando.
    const open = presaleCard(page, OPEN_PRODUCT);
    await scrollIntoView(open);
    await settled(open);
    await open.getByRole("button", { name: "Cancelar preventa" }).click();
    await confirmAction(page, "Cancelar preventa");
    await expect
      .poll(() => db.productPresale.findFirstOrThrow({ where: { productId: ids.open } }).then((row) => row.status), { timeout: 30_000 })
      .toBe(ProductPresaleStatus.CANCELLED);
    expect(await db.inventoryMovement.count({ where: { productId: ids.open } })).toBe(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "390-8-preventas-cancelada.png"), fullPage: true });
  });

  test("6. llega la mercancía: «Liberar» en Preventas y «Marcar saldo recibido» en el pedido", async ({ page }) => {
    test.setTimeout(300_000);
    // La entrada de la mercancía (2 unidades) es otra pantalla: aquí se deja el stock listo.
    await db.product.update({ where: { id: ids.deposit }, data: { stock: 2 } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `/${storeId}/preventas`);
    const card = presaleCard(page, DEPOSIT_PRODUCT);
    await expect(card).toBeVisible({ timeout: 90_000 });
    await settled(card);
    await card.getByRole("button", { name: "Liberar" }).click();
    await confirmAction(page, "Liberar");
    await expect
      .poll(() => db.productPresale.findUniqueOrThrow({ where: { id: ids.presale } }).then((row) => row.status), { timeout: 60_000 })
      .toBe(ProductPresaleStatus.RELEASED);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.deposit } })).stock).toBe(0);
    const movements = await db.inventoryMovement.findMany({ where: { productId: ids.deposit } });
    expect(movements.reduce((total, movement) => total + movement.quantity, 0)).toBe(-2);

    const entry = await db.preorderWaitlistEntry.findUniqueOrThrow({ where: { id: entries["Clienta Anticipo 1280"] } });
    const order = await db.order.findUniqueOrThrow({ where: { id: entry.orderId! } });
    expect(order.status).toBe(OrderStatus.DEPOSIT_PAID);
    // Liberada, falta el saldo: ahora sí pide atención.
    const queue = await porAtender(page, order.orderNumber, "1280-8-por-atender-saldo");
    expect(queue).toEqual({ porAtender: 1, todos: 1 });

    await page.goto(new URL(`/${storeId}/pedidos/${order.id}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    const mark = page.getByRole("button", { name: "Marcar saldo recibido" }).filter({ visible: true }).first();
    await expect(mark).toBeVisible({ timeout: 90_000 });
    await expect(mark).toBeEnabled();
    await settled(mark);
    const dialog = page.getByRole("dialog", { name: "Marcar saldo recibido" });
    await expect(async () => {
      await mark.click();
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await settled(dialog);
    await expect(dialog.getByText("Saldo a recibir:")).toContainText(/130[.,]000/);
    await page.screenshot({ path: path.join(SHOTS, "1280-8-dialogo-saldo.png") });
    await dialog.getByRole("button", { name: "Anotar saldo" }).click();
    await expect
      .poll(() => db.order.findUniqueOrThrow({ where: { id: order.id } }).then((row) => `${row.status}/${row.paidAt !== null}`), { timeout: 60_000 })
      .toBe(`${OrderStatus.PAID}/true`);
    const payments = await db.orderPayment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(payments.map((payment) => [payment.kind, payment.amount])).toEqual([
      ["DEPOSIT", DEPOSIT],
      ["BALANCE", PRICE - DEPOSIT],
    ]);
    expect(await db.inventoryMovement.count({ where: { productId: ids.deposit } })).toBe(movements.length);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, "1280-9-pedido-pagado.png"), fullPage: true });
  });
});
