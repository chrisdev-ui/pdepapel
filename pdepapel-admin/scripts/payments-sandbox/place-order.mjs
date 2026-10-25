// Pedido de verdad en la tienda local (base de PRUEBAS) y, si se pide, pago en el
// checkout alojado de Wompi en modo sandbox con una tarjeta de prueba publicada
// (4242… aprueba, 4111… rechaza). Necesita la tienda detrás de un túnel https:
// Wompi rechaza un redirect-url con http://localhost.
// Uso (desde pdepapel-admin):
//   node scripts/payments-sandbox/place-order.mjs <caso> <online|transfer> [--coupon CÓDIGO] [--wompi-card 4242…|none] [--pay-url-of <caso>]
//   node scripts/payments-sandbox/place-order.mjs <caso> retry --of <caso> --wompi-card 4242…   (reintento desde /pedido tras un rechazo)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { STORE, STORE_PORT, UPSTASH_PORT, WORK } from "./paths.mjs";
const require = createRequire(STORE + "package.json");
const { chromium } = require("@playwright/test");
const [caseName, method = "online", ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const coupon = opt("--coupon"); const card = opt("--wompi-card");
const BASE = `http://localhost:${STORE_PORT}`;
const DIR = WORK;
const CART = { state: { items: [{ id: "e2e-fair-product", slug: "producto-feria-e2e", name: "Producto feria E2E", description: "Producto exclusivo para las pruebas E2E.", price: "10000", stock: 20, isFeatured: false, isArchived: false, category: { id: "00000000-0000-4000-8000-000000000002", name: "Categoría E2E", typeId: "00000000-0000-4000-8000-000000000001" }, size: { id: "e2e-fair-size", name: "M", value: "M-P" }, color: { id: "e2e-fair-color", name: "E2E", value: "#ffffff" }, design: { id: "e2e-fair-design", name: "E2E" }, images: [], reviews: [], sku: "E2E-FAIR-PRODUCT", quantity: 2 }] }, version: 1 };
{ const call = async (c) => (await (await fetch(`http://127.0.0.1:${UPSTASH_PORT}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })).json()).result;
  const keys = await call(["KEYS", "orders:*"]); if (keys.length) await call(["DEL", ...keys]); }
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const fillSure = async (loc, value) => { for (let i = 0; i < 8; i++) { await loc.waitFor({ state: "visible", timeout: 30_000 }); await loc.fill(value); await page.waitForTimeout(300); if ((await loc.inputValue()).replace(/\s/g, "") === value.replace(/\s/g, "")) return; await page.waitForTimeout(700); } throw new Error("no se pudo llenar " + value.slice(0, 4)); };
let firstWompiUrl = null;
page.on("framenavigated", (f) => { if (f === page.mainFrame() && !firstWompiUrl && /checkout\.wompi\.co\/p\//.test(f.url())) firstWompiUrl = f.url(); });
const shot = (n) => page.screenshot({ path: DIR + "shots/" + caseName + "-" + n + ".png", fullPage: false }).catch(() => {});
try {
  await page.route("**/boldPaymentButton.js", (r) => r.abort());
  await page.route("**/api/locations**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA", city: "MEDELLÍN", department: "ANTIOQUIA", daneCode: "05001000", raw: { locationCode: "05001000", cityName: "MEDELLÍN", departmentName: "ANTIOQUIA" } }], count: 1 }) }));
  await page.addInitScript((cart) => { localStorage.setItem("cart-storage", JSON.stringify(cart)); localStorage.removeItem("checkout-storage"); localStorage.setItem("privacy-consent", JSON.stringify({ analytics: false, decidedAt: Date.now() })); }, CART);
  const payUrlFile = opt("--pay-url-of");
  const retryOf = method === "retry" ? opt("--of") : null;
  if (retryOf) {
    const { readFileSync } = await import("node:fs");
    const orderId = readFileSync(DIR + "order-" + retryOf + ".txt", "utf8").trim();
    await page.goto(BASE + "/pedido/" + orderId);
    await page.getByRole("button", { name: /Pagar ahora/ }).click({ timeout: 60_000 });
    await page.waitForURL(/checkout\.wompi\.co/, { timeout: 60_000 });
    console.log("RETRY_OF", orderId);
  } else if (payUrlFile) {
    const { readFileSync } = await import("node:fs");
    await page.goto(readFileSync(DIR + "wompi-url-" + payUrlFile + ".txt", "utf8").trim());
    await page.waitForURL(/checkout\.wompi\.co/, { timeout: 60_000 });
  } else {
  await page.goto(BASE + "/finalizar-compra");
  const btn = (name) => page.locator("#checkout-form form").getByRole("button", { name });
  await btn("Continuar a entrega").waitFor({ timeout: 90_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Prueba Sandbox");
  await page.getByLabel(/Correo electrónico/).fill("sandbox+" + caseName + "@example.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3025556677");
  await page.getByLabel(/Documento de identidad/).fill("1047452823");
  await btn("Continuar a entrega").click();
  await page.getByRole("heading", { name: "¿A dónde lo enviamos?" }).waitFor({ timeout: 30_000 });
  await page.locator('label[for="opt-custom_whatsapp"]').click();
  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click(); await city.fill("Medell");
  await page.getByRole("option").first().click();
  await page.getByLabel(/^Dirección \*/).fill("Calle 123 # 45-67");
  await btn("Continuar al pago").click();
  await page.getByRole("heading", { name: "Pago y confirmación" }).waitFor({ timeout: 30_000 });
  if (coupon) {
    await page.getByPlaceholder("Escribe tu código").fill(coupon);
    await page.getByRole("button", { name: "Aplicar" }).first().click();
    await page.waitForTimeout(2500);
  }
  await page.getByText(method === "transfer" ? "Transferencia bancaria" : "Pago en línea", { exact: true }).click();
  await shot("1-pago");
  await page.locator("#checkout-form form").getByRole("button", { name: /Pagar \$|Confirmar|Finalizar|Hacer pedido/ }).first().click();
  await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 90_000 });
  const orderId = new URL(page.url()).pathname.split("/").pop();
  console.log("ORDER", orderId);
  writeFileSync(DIR + "order-" + caseName + ".txt", orderId);
  await shot("2-pedido");
  }
  if ((method === "online" || method === "retry") && card) {
    if (!payUrlFile && !retryOf) {
    await page.getByRole("button", { name: /Pagar con otra pasarela segura/ }).click({ timeout: 60_000 });
    await page.waitForURL(/checkout\.wompi\.co/, { timeout: 60_000 });
    }
    console.log("WOMPI_URL_HOST", new URL(page.url()).host);
    if (firstWompiUrl) writeFileSync(DIR + "wompi-url-" + caseName + ".txt", firstWompiUrl);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("3-wompi");
    if (card !== "none") {
      await page.getByText("Tarjeta débito o crédito").first().click();
      await fillSure(page.getByPlaceholder(/nombres y apellidos/i), "Prueba Sandbox");
      await fillSure(page.getByPlaceholder(/correo electrónico/i), "sandbox+" + caseName + "@example.com");
      await fillSure(page.getByPlaceholder(/número de (telular|celular|teléfono)/i), "3025556677");
      await page.getByRole("button", { name: /Continuar con tu pago/ }).click();
      await fillSure(page.getByPlaceholder("Ingresa el número de la tarjeta"), card);
      await page.locator("select").nth(0).selectOption({ label: "12" });
      await page.locator("select").nth(1).selectOption({ label: "30" });
      await fillSure(page.getByPlaceholder("Ingresa tu código seguridad"), "123");
      await fillSure(page.getByPlaceholder("Ingresa nombre y apellido del titular"), "Prueba Sandbox");
      await fillSure(page.getByPlaceholder("Ingresa tu número de documento"), "1047452823");
      await page.getByText(/Acepto haber leído/).click();
      await page.getByText(/Acepto la/).first().click();
      await page.getByRole("button", { name: /Continuar con tu pago/ }).click();
      const result = page.getByText(/Pago aprobado|Pago rechazado|Pago declinado|no fue aprobado|rechaz/i).first();
      await result.waitFor({ timeout: 90_000 });
      console.log("WOMPI_RESULT", (await result.textContent()).trim());
      await shot("4-resultado");
      if (process.env.RETURN !== "0") {
        await page.getByRole("button", { name: /Volver al comercio/ }).click().catch(() => {});
        await page.waitForURL(/\/pedido\//, { timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        console.log("RETURN_URL_HOST", new URL(page.url()).host);
        await shot("5-regreso");
      }
    }
  }
  if (process.env.KEEP_OPEN) await new Promise(() => {});
} catch (e) { console.log("ERROR", e.message.split("\n")[0]); await shot("error"); process.exitCode = 1; }
finally { if (!process.env.KEEP_OPEN) await browser.close(); }
