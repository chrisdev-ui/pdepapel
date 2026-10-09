/**
 * Corrige el desglose comisión/envío guardado en ventas de Mercado Libre
 * (issue #21): Mercado Libre pone `shipping_info` también en la línea de
 * comisión y el lector viejo la contaba como envío. El plan (valores antes y
 * después por venta) se arma con una lectura de facturación y vive fuera del
 * repositorio, porque trae cifras del negocio.
 *
 *   node --env-file=.env scripts/backfill-ml-fee-split.mjs <plan.json>
 *       ENSAYO: compara cada venta con su «antes» y muestra el cambio. No escribe.
 *   npm run prod:write -- scripts/backfill-ml-fee-split.mjs <plan.json> --apply --expect new
 *       Escribe en una transacción. Cada venta se actualiza solo si todavía
 *       tiene exactamente los valores «antes»; si una no coincide, no se escribe nada.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const planPath = args.find((arg) => !arg.startsWith("--"));
if (!planPath) throw new Error("uso: <plan.json> [--apply]");
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const FIELDS = ["marketplaceFee", "shippingCost", "netAmount", "refundedAmount"];
const same = (a, b) => (a === null || a === undefined ? null : Number(a)) === (b === null || b === undefined ? null : Number(b));

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-ml-fee-split.mjs <plan.json> --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
}

try {
  const resolved = [];
  for (const row of plan) {
    const matches = await db.marketplaceOrder.findMany({ where: { id: { startsWith: row.idPrefix } }, select: { id: true, marketplaceFee: true, shippingCost: true, netAmount: true, refundedAmount: true } });
    if (matches.length !== 1) throw new Error(`${row.idPrefix}: se esperaba 1 venta, hay ${matches.length}`);
    const current = matches[0];
    const drift = FIELDS.filter((field) => !same(current[field], row.before[field]));
    const changes = FIELDS.filter((field) => !same(row.before[field], row.after[field]));
    resolved.push({ ...row, id: current.id, drift, changes });
    console.log(`${row.idPrefix}: ${changes.length ? changes.map((f) => `${f} ${row.before[f]} → ${row.after[f]}`).join(" · ") : "sin cambios"}${drift.length ? `  ¡DIFERENTE DEL PLAN en ${drift.join(", ")}!` : ""}`);
  }
  if (resolved.some((row) => row.drift.length)) throw new Error("Alguna venta cambió desde el plan. No se escribe nada.");
  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await db.$transaction(async (tx) => {
      let count = 0;
      for (const row of resolved.filter((r) => r.changes.length)) {
        const where = { id: row.id };
        for (const field of FIELDS) where[field] = row.before[field];
        const result = await tx.marketplaceOrder.updateMany({ where, data: Object.fromEntries(row.changes.map((f) => [f, row.after[f]])) });
        if (result.count !== 1) throw new Error(`${row.idPrefix} cambió durante la escritura. No se escribió nada.`);
        count += 1;
      }
      return count;
    }, { timeout: 60_000, maxWait: 10_000 });
    console.log(`PROD_WRITE_ROWS=${written}`);
  }
} finally {
  await db.$disconnect();
}
