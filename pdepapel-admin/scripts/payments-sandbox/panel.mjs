// Cambia el estado de pedidos en el panel LOCAL con la usuaria de pruebas de las
// e2e (agent task de Clerk de desarrollo), por el mismo endpoint que «Cambiar
// estado» en Pedidos. Corre con with-e2e-env (trae las llaves de Clerk dev):
//   node scripts/with-e2e-env.mjs node scripts/payments-sandbox/panel.mjs <ESTADO> <orderId...>
import { createRequire } from "node:module";
import { ADMIN, ADMIN_PORT, WORK } from "./paths.mjs";
const require = createRequire(ADMIN + "package.json");
const { createClerkClient } = require("@clerk/backend");
const { chromium } = require("@playwright/test");
const [status, ...ids] = process.argv.slice(2);
const sk = process.env.CLERK_SECRET_KEY, uid = process.env.E2E_ADMIN_CLERK_USER_ID, sid = process.env.E2E_ADMIN_STORE_ID;
if (!sk?.startsWith("sk_test_") || !uid || !sid) throw new Error("faltan credenciales de desarrollo de las e2e");
const base = `http://localhost:${ADMIN_PORT}`;
const task = await createClerkClient({ secretKey: sk }).agentTasks.create({ onBehalfOf: { userId: uid }, permissions: "*", agentName: "pdepapel-sandbox-pagos", taskDescription: "Sandbox de pagos: cambiar estado de pedidos de prueba", redirectUrl: base + "/" + sid + "/pedidos", sessionMaxDurationInSeconds: 300 });
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp("/" + sid + "/pedidos"), { timeout: 60_000 });
  const res = await page.request.patch(base + "/api/" + sid + "/orders", { data: { ids, status } });
  console.log("PATCH", status, res.status(), (await res.text()).slice(0, 200));
} finally { await browser.close(); }
