// --import del servidor de la administración en el sandbox de pagos: red
// cortada salvo local, Clerk de desarrollo y las APIs de PRUEBA de Wompi/Bold.
// Resend se intercepta (cada correo queda en SANDBOX_MAIL_LOG, nunca sale) y
// EnvioClick es de mentira: cotiza con tarifas fijas y se niega a crear guías.
import { appendFileSync } from "node:fs";
import { blockOutboundNetwork } from "../lib/test-isolation.mjs";

const ALLOW = ["clerk.accounts.dev", "api.clerk.com", "api.clerk.dev", "sandbox.wompi.co", "payments.api.bold.co"];
blockOutboundNetwork({ allowHosts: ALLOW });

const log = process.env.SANDBOX_MAIL_LOG;
let n = 0;
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const record = (mail) => {
  const entry = { at: new Date().toISOString(), to: list(mail.to), subject: mail.subject ?? null, html: Boolean(mail.html), text: Boolean(mail.text), htmlLength: mail.html ? String(mail.html).length : 0 };
  if (log) appendFileSync(log, JSON.stringify(entry) + "\n");
};
const original = globalThis.fetch;
globalThis.fetch = async function fetch(input, init) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.resend.com") {
    let body = init?.body;
    if (body === undefined && input && typeof input === "object" && "text" in input) body = await input.text();
    let parsed = null;
    try { parsed = JSON.parse(String(body)); } catch {}
    if (Array.isArray(parsed)) {
      parsed.forEach(record);
      return new Response(JSON.stringify({ data: parsed.map(() => ({ id: "captured_" + ++n })) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (parsed) record(parsed);
    return new Response(JSON.stringify({ id: "captured_" + ++n }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "envioclick.stub.invalid") {
    // EnvioClick de mentira: cotiza con tarifas fijas y se niega a crear guías.
    const elog = (entry) => { if (log) appendFileSync(log.replace(/mail\.jsonl$/, "envioclick.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n"); };
    if (url.pathname === "/api/v2/quotation") {
      let body = {}; try { body = JSON.parse(String(init?.body ?? "{}")); } catch {}
      const cod = Number(body.codValue ?? 0) > 0;
      const rate = (idRate, carrier, flete, isCod) => ({ idRate, idProduct: 1, product: isCod ? "Normal COD" : "Normal", idCarrier: idRate, carrier, flete, minimumInsurance: 650, extraInsurance: 0, deliveryDays: 2, distance: null, quotationType: "normal", cod: isCod, codDetails: isCod ? { codCost: Math.round(Number(body.codValue) * 0.035) + 3000, codCostWithInsurance: Math.round(Number(body.codValue) * 0.035) + 3650, codPaymentMethod: body.codPaymentMethod ?? "cash", includeGuideCost: Boolean(body.includeGuideCost) } : null });
      const rates = cod ? [rate(902, "COORDINADORA", 6630, true), rate(907, "TCC", 15272, true)] : [rate(101, "COORDINADORA", 6630, false), rate(103, "ENVIA", 8117, false)];
      elog({ path: url.pathname, cod, codValue: body.codValue ?? null, rates: rates.length });
      return new Response(JSON.stringify({ status: "OK", status_codes: [200], status_messages: [], data: { packages: body.packages ?? [], description: body.description ?? "", contentValue: body.contentValue ?? 0, origin: body.origin ?? {}, destination: body.destination ?? {}, rates, idCarriersNoWsResult: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    elog({ path: url.pathname, blocked: true });
    return new Response(JSON.stringify({ status: "ERROR", status_messages: [{ error: "sandbox: guías bloqueadas" }] }), { status: 503, headers: { "content-type": "application/json" } });
  }
  return original(input, init);
};
