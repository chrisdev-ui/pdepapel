// Webhooks de Bold FIRMADOS LOCALMENTE con la llave secreta de PRUEBA (nunca
// impresa) o con clave vacía (--empty-key), como firma Bold en modo pruebas y
// que el panel rechaza a propósito. Van por el túnel.
//   node scripts/payments-sandbox/bold.mjs <númeroDePedido> <TIPO> --total N [--tip N] [--no-tip-field] [--empty-key] [--tx ID]
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

import { ADMIN, WORK, sandboxEnv } from "./paths.mjs";
const env = sandboxEnv();
const [reference, type, ...rest] = process.argv.slice(2);
const val = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const amount = { currency: "COP", total: Number(val("--total")), taxes: [] };
if (!rest.includes("--no-tip-field")) amount.tip = Number(val("--tip") ?? 0);
const body = JSON.stringify({ id: "local-" + Date.now(), type, subject: val("--tx") ?? "sandbox-" + reference, source: "/payments", spec_version: "1.0", time: Date.now() * 1e6, data: { payment_id: val("--tx") ?? "sandbox-" + reference + "-" + type, merchant_id: "sandbox", created_at: new Date().toISOString(), amount, metadata: { reference }, payment_method: "CARD" }, datacontenttype: "application/json" });
const key = rest.includes("--empty-key") ? "" : env.BOLD_SECRET_KEY.trim();
const sig = crypto.createHmac("sha256", key).update(Buffer.from(body, "utf8").toString("base64")).digest("hex");
const sid = readFileSync(ADMIN + ".env.e2e.local", "utf8").match(/^\s*(?:export\s+)?E2E_ADMIN_STORE_ID\s*=\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim() ?? "e2e-admin-store";
const url = readFileSync(WORK + "tunnel-url.txt", "utf8").trim() + "/api/webhook/bold?store=" + encodeURIComponent(sid);
const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-bold-signature": sig }, body });
console.log("BOLD FIRMADO LOCALMENTE", rest.includes("--empty-key") ? "(clave vacía)" : "", type, JSON.stringify(amount), "→ HTTP", r.status, (await r.text()).slice(0, 160));
