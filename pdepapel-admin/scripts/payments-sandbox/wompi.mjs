// Wompi SANDBOX con las llaves de prueba de .env.sandbox.local (nunca impresas):
//   tx <referencia>          transacciones por referencia (lo que usa la conciliación)
//   void <idTransacción>     POST /transactions/{id}/void (Wompi no manda evento al anular)
//   event <referencia> <ESTADO> [--tx ID] [--amount CENTAVOS] [--bad-signature] [--direct]
//                            evento FIRMADO LOCALMENTE con el secreto de eventos de prueba
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

import { ADMIN_PORT, WORK, sandboxEnv } from "./paths.mjs";
const env = sandboxEnv();
const API = "https://sandbox.wompi.co/v1";
const [cmd, arg, status, ...rest] = process.argv.slice(2);
const flag = (k) => rest.includes(k);
const val = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const auth = { Authorization: "Bearer " + env.WOMPI_API_SECRET.trim() };
const pick = (t) => ({ id: t.id, reference: t.reference, status: t.status, amount_in_cents: t.amount_in_cents, payment_method_type: t.payment_method_type, created_at: t.created_at });
if (cmd === "tx") {
  const r = await fetch(API + "/transactions?reference=" + encodeURIComponent(arg), { headers: auth });
  const j = await r.json();
  console.log("HTTP", r.status, "keys:", Object.keys(j).join(","), "data:", JSON.stringify(Array.isArray(j.data) ? j.data.map(pick) : j.data ? pick(j.data) : j.error));
} else if (cmd === "void") {
  const r = await fetch(API + "/transactions/" + arg + "/void", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}" });
  const j = await r.json().catch(() => ({}));
  console.log("HTTP", r.status, JSON.stringify(j.data ? { status: j.data.transaction?.status ?? j.data.status, id: j.data.transaction?.id ?? j.data.id } : j.error ?? j));
} else if (cmd === "event") {
  const amount = Number(val("--amount") ?? 2000000);
  const txId = val("--tx") ?? "local-" + Date.now();
  const tx = { id: txId, amount_in_cents: amount, reference: arg, customer_email: "sandbox+local@example.com", currency: "COP", payment_method_type: "CARD", redirect_url: null, status, shipping_address: null, payment_link_id: null, payment_source_id: null };
  const timestamp = Math.floor(Date.now() / 1000);
  const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const values = [tx.id, tx.status, tx.amount_in_cents].join("");
  let checksum = crypto.createHash("sha256").update(values + timestamp + env.WOMPI_EVENTS_KEY.trim()).digest("hex");
  if (flag("--bad-signature")) checksum = crypto.createHash("sha256").update("firma-equivocada" + timestamp).digest("hex");
  const body = { event: "transaction.updated", data: { transaction: tx }, environment: "test", signature: { properties: props, checksum }, timestamp, sent_at: new Date().toISOString() };
  const url = (flag("--direct") ? `http://localhost:${ADMIN_PORT}` : readFileSync(WORK + "tunnel-url.txt", "utf8").trim()) + "/api/webhook/wompi";
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-event-checksum": checksum }, body: JSON.stringify(body) });
  console.log("EVENTO FIRMADO LOCALMENTE", flag("--bad-signature") ? "(firma inválida a propósito)" : "", "→ HTTP", r.status, (await r.text()).slice(0, 160));
}
