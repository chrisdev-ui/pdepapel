// Pedido contra entrega en la tienda local con EnvioClick de mentira (el guard
// de la administración cotiza con tarifas fijas y se niega a crear guías).
// Uso: node scripts/payments-sandbox/cod-order.mjs [explore|order]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { STORE, STORE_PORT, UPSTASH_PORT, WORK } from "./paths.mjs";
const require = createRequire(STORE + "package.json");
const { chromium } = require("@playwright/test");
const DIR = WORK;
const stage = process.argv[2] ?? "explore";
{ const call = async (c) => (await (await fetch(`http://127.0.0.1:${UPSTASH_PORT}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })).json()).result;
  const keys = await call(["KEYS", "orders:*"]); if (keys.length) await call(["DEL", ...keys]); }
const CART = { state: { items: [{ id: "e2e-fair-product", slug: "producto-feria-e2e", name: "Producto feria E2E", description: "x", price: "10000", stock: 20, isFeatured: false, isArchived: false, category: { id: "00000000-0000-4000-8000-000000000002", name: "Categoría E2E", typeId: "00000000-0000-4000-8000-000000000001" }, size: { id: "e2e-fair-size", name: "M", value: "M-P" }, color: { id: "e2e-fair-color", name: "E2E", value: "#ffffff" }, design: { id: "e2e-fair-design", name: "E2E" }, images: [], reviews: [], sku: "E2E-FAIR-PRODUCT", quantity: 2 }] }, version: 1 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const shot = (n) => page.screenshot({ path: DIR + "shots/c8b-" + n + ".png", fullPage: true }).catch(() => {});
try {
  await page.route("**/boldPaymentButton.js", (r) => r.abort());
  await page.route("**/api/locations**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ value: "05001000", label: "MEDELLÍN - ANTIOQUIA", city: "MEDELLÍN", department: "ANTIOQUIA", daneCode: "05001000", raw: { locationCode: "05001000", cityName: "MEDELLÍN", departmentName: "ANTIOQUIA" } }], count: 1 }) }));
  await page.addInitScript((cart) => { localStorage.setItem("cart-storage", JSON.stringify(cart)); localStorage.removeItem("checkout-storage"); }, CART);
  await page.goto(`http://localhost:${STORE_PORT}/finalizar-compra`);
  const btn = (name) => page.locator("#checkout-form form").getByRole("button", { name });
  await btn("Continuar a entrega").waitFor({ timeout: 90_000 });
  await page.getByLabel(/Nombre y apellidos/).fill("Prueba Sandbox");
  await page.getByLabel(/Correo electrónico/).fill("sandbox+c8b@example.com");
  await page.getByRole("textbox", { name: /Teléfono/ }).fill("3025556677");
  await page.getByLabel(/Documento de identidad/).fill("1047452823");
  await btn("Continuar a entrega").click();
  await page.getByRole("heading", { name: "¿A dónde lo enviamos?" }).waitFor({ timeout: 30_000 });
  await page.locator('label[for="opt-envioclick"]').click();
  const city = page.getByRole("combobox", { name: /Ciudad/ });
  await city.click(); await city.fill("Medell"); await page.getByRole("option").first().click();
  await page.getByLabel(/^Dirección \*/).fill("Calle 123 # 45-67");
  await page.waitForTimeout(6000);
  await shot("1-tarifas");
  const radios = await page.getByRole("radio").evaluateAll((els) => els.map((e) => (e.closest("label")?.innerText || e.getAttribute("aria-label") || e.id || "").replace(/\s+/g, " ").slice(0, 90)));
  console.log("RADIOS", JSON.stringify(radios));
  if (stage === "order") {
    await page.locator('label[for="rate-902"]').click();
    await page.waitForTimeout(1500);
    await btn("Continuar al pago").click();
    await page.getByRole("heading", { name: "Pago y confirmación" }).waitFor({ timeout: 30_000 });
    await shot("2-pago");
    const pay = await page.getByText(/contra entrega/i).allInnerTexts();
    console.log("PAGO", JSON.stringify(pay.map((t) => t.slice(0, 80))));
    await page.getByText("Pago contra entrega", { exact: true }).click();
    await page.waitForTimeout(1000);
    await shot("3-cod");
    await page.locator("#checkout-form form").getByRole("button", { name: /Pagar|Confirmar|Finalizar|Hacer pedido/ }).first().click();
    await page.waitForURL(/\/pedido\/[^/?]+/, { timeout: 90_000 });
    const orderId = new URL(page.url()).pathname.split("/").pop();
    writeFileSync(DIR + "order-c8b.txt", orderId); console.log("ORDER", orderId);
    await shot("4-pedido");
  }
} catch (e) { console.log("ERROR", e.message.split("\n")[0]); await shot("error"); process.exitCode = 1; }
finally { await browser.close(); }
