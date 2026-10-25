// Lee las filas de pagos de Sistemas en el panel LOCAL (usuaria de pruebas).
//   node scripts/with-e2e-env.mjs node scripts/payments-sandbox/sistemas.mjs [etiqueta]
import { createRequire } from "node:module";
import { ADMIN, ADMIN_PORT, WORK } from "./paths.mjs";
const require = createRequire(ADMIN + "package.json");
const { createClerkClient } = require("@clerk/backend");
const { chromium } = require("@playwright/test");
const sk = process.env.CLERK_SECRET_KEY, uid = process.env.E2E_ADMIN_CLERK_USER_ID, sid = process.env.E2E_ADMIN_STORE_ID;
if (!sk?.startsWith("sk_test_")) throw new Error("solo Clerk de desarrollo");
const base = `http://localhost:${ADMIN_PORT}`;
const task = await createClerkClient({ secretKey: sk }).agentTasks.create({ onBehalfOf: { userId: uid }, permissions: "*", agentName: "pdepapel-sandbox-pagos", taskDescription: "Sandbox de pagos: leer Sistemas", redirectUrl: base + "/" + sid, sessionMaxDurationInSeconds: 300 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
try {
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp("/" + sid + "(\\?.*)?$"), { timeout: 60_000 });
  const row = page.getByText(/Webhooks de pago \(24 h\)/).first();
  await row.waitFor({ timeout: 60_000 });
  await row.scrollIntoViewIfNeeded();
  for (const label of [/Webhooks de pago \(24 h\)/, /Conciliación de pagos|conciliación/i]) {
    const el = page.getByText(label).first();
    if (await el.count()) { const box = el.locator("xpath=ancestor::*[self::li or self::tr or contains(@class,'row') or self::div][1]"); console.log("FILA:", (await box.innerText()).replace(/\s+/g, " ").slice(0, 300)); }
  }
  await page.screenshot({ path: WORK + "shots/sistemas-" + (process.argv[2] ?? "x") + ".png", fullPage: true });
} finally { await browser.close(); }
