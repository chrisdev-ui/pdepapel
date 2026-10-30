import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./helpers/local-test";
import { deliverBoldWebhook, LOCAL_STORE_PORT, localAdminOrigin, localApiUrl, SEEDED_STORE_ID } from "./helpers/local-environment";
import { skipPrivacyBanner } from "../helpers/public-page";

/**
 * Lote 2 de la preventa contra la administración local, en la página real del
 * pedido: abonar (con el mínimo y el tope del servidor), pagar el saldo cuando
 * Paula lo pide, el webhook firmado de verdad (Wompi con la llave de pruebas,
 * Bold con su HMAC), un webhook repetido que no suma, un valor que no cuadra,
 * una anulación que no mueve nada y el aviso «No alcanzó tu unidad».
 *
 * La pasarela no corre aquí: el botón de Wompi lleva a una página falsa y se
 * revisa el enlace firmado (referencia `-P<n>` y valor) antes de entregar el
 * webhook que mandaría la pasarela.
 *
 * Con la administración en frío el build de la tienda se pasa del tiempo al
 * prerenderizar /sitemap.xml: arranca la administración local, pide una vez
 * sus rutas de catálogo, compila la tienda (`node scripts/e2e-store-server.mjs`
 * con `NEXT_PUBLIC_API_URL` local), apágalas y corre con `E2E_SKIP_BUILD=1`.
 */

const ADMIN_DIR = path.resolve(process.cwd(), "../pdepapel-admin");
const SCREENSHOTS = path.join(ADMIN_DIR, "tmp/preventa-lote2-shots");
const STORE_ORIGIN = `http://localhost:${LOCAL_STORE_PORT}`;
const WOMPI_EVENTS_KEY = process.env.E2E_WOMPI_EVENTS_KEY || "test-stub";

function seed(mode: string, ...args: string[]) {
  const output = execFileSync("node", ["scripts/with-e2e-env.mjs", "node", "scripts/with-test-env.mjs", "npx", "tsx", "scripts/seed-e2e-preorder.ts", mode, ...args], {
    cwd: ADMIN_DIR,
    encoding: "utf8",
    env: { ...process.env, PRISMA_LOG: "" },
  });
  return JSON.parse(output.trim().split("\n").reverse().find((line) => line.startsWith("{")) ?? "{}");
}

type Payments = { status: string; total: number; paid: boolean; payments: { kind: string; status: string; amount: number; method: string; gatewayReference: string | null }[] };
const payments = (orderId: string): Payments => seed("payments", orderId);

async function wompiWebhook(reference: string, amount: number, status = "APPROVED", id = `WOMPI-${reference}`) {
  const transaction = { id, status, reference, amount_in_cents: Math.round(amount * 100), currency: "COP" };
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash("sha256").update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${WOMPI_EVENTS_KEY}`).digest("hex");
  const response = await fetch(`${localAdminOrigin}/api/webhook/wompi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "transaction.updated", data: { transaction }, signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum }, timestamp }),
  });
  return { status: response.status, body: await response.text() };
}

/** El enlace firmado de Wompi que la página abriría; la página falsa devuelve 200. */
async function captureWompiRedirect(page: Page, action: () => Promise<void>) {
  let captured = "";
  await page.route("https://checkout.wompi.co/**", async (route) => {
    captured = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Wompi (prueba)</body></html>" });
  });
  await action();
  await expect.poll(() => captured, { timeout: 30_000 }).not.toBe("");
  const url = new URL(captured);
  return {
    reference: url.searchParams.get("reference") ?? "",
    cents: Number(url.searchParams.get("amount-in-cents")),
    redirect: url.searchParams.get("redirect-url") ?? "",
  };
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page: Page, name: string) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
};

async function openOrder(page: Page, orderId: string, query = "") {
  await skipPrivacyBanner(page);
  // Sin el script de Bold el botón principal va a la otra pasarela, que sí se puede interceptar.
  await page.route("**/boldPaymentButton.js", (route) => route.abort());
  expect((await page.goto(`/pedido/${orderId}${query}`))?.status()).toBe(200);
}

let order = { orderId: "", orderNumber: "" };

test.describe("preventa: abonos y saldo en línea desde /pedido", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async () => {
    seed("seed");
    order = seed("online-order");
    // La administración local compila cada ruta la primera vez: sin esto la
    // primera visita a /pedido se pasa del tiempo de espera de la tienda.
    for (const route of [`orders/${order.orderId}`, `checkout/${order.orderId}/preorder-payment`]) {
      await fetch(`${localApiUrl(SEEDED_STORE_ID)}/${route}`, { signal: AbortSignal.timeout(180_000) }).catch(() => undefined);
    }
    // Los webhooks también: compilarlos a mitad de la prueba frena la lectura del pedido.
    for (const hook of ["wompi", `bold?store=${SEEDED_STORE_ID}`]) {
      await fetch(`${localAdminOrigin}/api/webhook/${hook}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(180_000) }).catch(() => undefined);
    }
  });

  test.afterAll(() => {
    seed("clean");
  });

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1280", width: 1280, height: 800 },
  ]) {
    test(`${viewport.name}: la tarjeta «Abonar a tu preventa» con el mínimo y el tope del servidor`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openOrder(page, order.orderId);
      const card = page.getByTestId("preorder-pay-card");
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card.getByRole("heading", { name: "Abonar a tu preventa" })).toBeVisible();
      await expect(page.getByTestId("preorder-pay-help")).toHaveText(/desde \$\s?10\.000 hasta \$\s?130\.000/);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await shot(page, `${viewport.name}-1-abonar`);
    });
  }

  test("390: abono de $20.000 por la pasarela, webhook firmado, aviso al volver; repetirlo no suma; un valor distinto no aprueba", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOrder(page, order.orderId);
    const input = page.getByLabel("¿Cuánto quieres abonar?");
    await expect(page.getByTestId("preorder-pay-online")).toContainText("Pagar en línea");
    await input.fill("5.000");
    await page.getByTestId("preorder-pay-online").click();
    await expect(page.getByRole("alert").filter({ hasText: "El abono mínimo es $ 10.000" })).toBeVisible();
    await input.fill("20.000");
    await expect(page.getByTestId("preorder-pay-online")).toHaveText(/Pagar \$\s?20\.000 en línea/);

    const redirect = await captureWompiRedirect(page, () => page.getByTestId("preorder-pay-online").click());
    expect(redirect.reference).toBe(`${order.orderNumber}-P1`);
    expect(redirect.cents).toBe(2_000_000);
    expect(redirect.redirect).toContain(`/pedido/${order.orderId}?pago=${order.orderNumber}-P1`);
    expect(payments(order.orderId).payments.filter((row) => row.status === "PENDING").map((row) => `${row.kind}:${row.amount}`)).toEqual(["INSTALLMENT:20000"]);

    const paid = await wompiWebhook(redirect.reference, 20000);
    expect(paid.status).toBe(200);
    await openOrder(page, order.orderId, `?pago=${encodeURIComponent(redirect.reference)}&id=WOMPI-1`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("¡Recibimos tu abono!", { timeout: 60_000 });
    await expect(page.getByTestId("deposit-progress")).toHaveText(/Llevas \$\s?50\.000 pagado · faltan \$\s?110\.000 \+ envío/);
    await expect(page.getByTestId("preorder-pay-help")).toHaveText(/hasta \$\s?110\.000/);
    await shot(page, "390-2-abono-recibido");

    const replay = await wompiWebhook(redirect.reference, 20000);
    expect(replay.status).toBe(200);
    expect(replay.body).toContain("ya estaba registrado");
    expect(payments(order.orderId).payments.filter((row) => row.status === "APPROVED").map((row) => `${row.kind}:${row.amount}`)).toEqual(["DEPOSIT:30000", "INSTALLMENT:20000"]);

    const second = await fetch(`${localApiUrl(SEEDED_STORE_ID)}/checkout/${order.orderId}/preorder-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: STORE_ORIGIN },
      body: JSON.stringify({ mode: "installment", amount: 10000, method: "Wompi" }),
    }).then((response) => response.json() as Promise<{ reference: string }>);
    const wrong = await wompiWebhook(second.reference, 1000);
    expect(wrong.status).toBe(400);
    expect(payments(order.orderId).payments.find((row) => row.gatewayReference === second.reference)?.status).toBe("PENDING");
  });

  test("1280: llega, Paula pide el saldo con el envío y la clienta lo paga: el pedido queda pagado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    seed("release");
    await openOrder(page, order.orderId);
    await expect(page.getByTestId("preorder-awaiting-balance")).toContainText("Estamos cotizando tu envío", { timeout: 60_000 });
    await expect(page.getByTestId("preorder-pay-card")).toHaveCount(0);

    expect(seed("request-balance", order.orderId, "12000")).toMatchObject({ total: 172000, shipping: 12000, amountDue: 122000 });
    await openOrder(page, order.orderId);
    const card = page.getByTestId("preorder-pay-card");
    await expect(card.getByRole("heading", { name: "Ya llegó tu producto: paga tu saldo" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("preorder-pay-help")).toContainText(/Tu saldo es \$\s?122\.000/);
    await expect(page.getByText("¡Ya llegó tu producto! Paga tu saldo y lo despachamos.")).toBeVisible();
    await expect(page.getByLabel("¿Cuánto quieres abonar?")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "1280-3-pagar-saldo");

    const redirect = await captureWompiRedirect(page, () => page.getByTestId("preorder-pay-online").click());
    expect(redirect.cents).toBe(12_200_000);
    expect((await wompiWebhook(redirect.reference, 122000)).status).toBe(200);
    expect(payments(order.orderId)).toMatchObject({ status: "PAID", paid: true, total: 172000 });

    await openOrder(page, order.orderId, `?pago=${encodeURIComponent(redirect.reference)}&id=WOMPI-2`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("¡Listo! Pagaste tu saldo", { timeout: 60_000 });
    await expect(page.getByTestId("preorder-pay-card")).toHaveCount(0);
    await shot(page, "1280-4-saldo-pagado");
  });

  test("Bold: el abono se aprueba con el webhook firmado; una anulación después no mueve nada", async () => {
    // La preventa de arriba ya se liberó: una campaña nueva para abonar.
    seed("seed");
    const other = seed("online-order") as { orderId: string };
    const charge = await fetch(`${localApiUrl(SEEDED_STORE_ID)}/checkout/${other.orderId}/preorder-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: STORE_ORIGIN },
      body: JSON.stringify({ mode: "installment", amount: 15000, method: "Bold" }),
    }).then((response) => response.json() as Promise<{ reference: string; integritySignature: string }>);
    expect(charge.integritySignature).toMatch(/^[a-f0-9]{64}$/);
    const approved = await deliverBoldWebhook({ storeId: SEEDED_STORE_ID, type: "SALE_APPROVED", reference: charge.reference, total: 15000 });
    expect(approved.status).toBe(200);
    const voided = await deliverBoldWebhook({ storeId: SEEDED_STORE_ID, type: "VOID_APPROVED", reference: charge.reference, total: 15000 });
    expect(voided.status).toBe(200);
    const after = payments(other.orderId);
    expect(after.status).toBe("DEPOSIT_PAID");
    expect(after.payments.find((row) => row.gatewayReference === charge.reference)).toMatchObject({ status: "APPROVED", method: "Bold", amount: 15000 });
  });

  test("390: «No alcanzó tu unidad» en vez de pagar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const unfulfilled = seed("unfulfilled-order") as { orderId: string };
    await openOrder(page, unfulfilled.orderId);
    await expect(page.getByTestId("preorder-unfulfilled")).toContainText("te escribimos para la devolución", { timeout: 60_000 });
    await expect(page.getByText("Saldo al llegar")).toHaveCount(0);
    await expect(page.getByTestId("preorder-pay-card")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "390-5-sin-unidad");
  });
});
