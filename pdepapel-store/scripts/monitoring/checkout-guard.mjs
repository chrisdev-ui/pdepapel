#!/usr/bin/env node
/**
 * Is this checkout running today's monitoring code? Called first by the launchd wrappers.
 *
 *   node --env-file-if-exists=scripts/monitoring/.env scripts/monitoring/checkout-guard.mjs --weekly
 *     stale → macOS + Web Push «Monitoreo: la copia principal está desactualizada (git pull)», exit 3
 *   node scripts/monitoring/checkout-guard.mjs --daily
 *     prints one warning line (or nothing) for daily-check's result; always exit 0
 */
import { bogotaDate } from "./lib/common.mjs";
import { STALE_TITLE, inspectCheckout } from "./lib/checkout-guard.mjs";
import { notifyAll } from "./lib/notify.mjs";

const weekly = process.argv.includes("--weekly");

let status;
try {
  status = inspectCheckout();
} catch {
  status = { stale: false, reasons: [], note: "no se pudo revisar la copia con git" };
}

if (!weekly) {
  const parts = [...(status.stale ? [`${STALE_TITLE}: ${status.reasons.join("; ")}`] : []), ...(status.note ? [status.note] : [])];
  if (parts.length) console.log(parts.join(" · "));
  process.exit(0);
}

if (status.note) console.log(`aviso: ${status.note}`);
if (!status.stale) {
  console.log("copia principal al día en los archivos del monitoreo");
  process.exit(0);
}

console.log(`${STALE_TITLE}: ${status.reasons.join("; ")}`);
const sent = await notifyAll({
  title: STALE_TITLE,
  body: `No corrí la revisión semanal: ${status.reasons.join("; ")}.`,
  tag: `monitoreo-copia-desactualizada-${bogotaDate()}`,
});
console.log("Avisos:", JSON.stringify(sent));
process.exit(3);
