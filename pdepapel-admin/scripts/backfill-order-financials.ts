/**
 * Financieros de los pedidos pagados que nunca los tuvieron (creados ya
 * pagados o pagados en bloque antes del 2026-09-10). Regla y guardas en
 * `lib/order-financials-backfill.ts`. Costo de compra ACTUAL, solo compra.
 *
 *   npx tsx --env-file=.env scripts/backfill-order-financials.ts
 *       ENSAYO con el usuario de lectura: cuenta los pedidos a escribir y los
 *       de revisión manual, y guarda el plan (ids y valores, nada de clientas)
 *       en output/audits/ (local, ignorado). No escribe.
 *   npm run prod:write -- scripts/backfill-order-financials.ts --apply --plan "<plan.json>" --expect-rows N --expect new
 *       En una transacción vuelve a calcular el plan: tiene que ser idéntico al
 *       del ensayo y sumar N, y cada pedido se escribe solo si sus dos campos
 *       siguen en NULL. Si algo no coincide, nada.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { applyOrderFinancialsBackfill, orderFinancialsPlan, type OrderFinancialsPlan } from "../lib/order-financials-backfill";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const expectRows = valueOf("--expect-rows") === undefined ? undefined : Number(valueOf("--expect-rows"));
const planPath = valueOf("--plan");

async function client(): Promise<PrismaClient> {
  if (process.env.PROD_WRITE_APPROVED === "1") {
    const { createProdClient } = (await import("./lib/prod-client.mjs")) as unknown as { createProdClient: () => PrismaClient };
    return createProdClient();
  }
  if (apply) throw new Error('--apply solo corre con `npm run prod:write -- scripts/backfill-order-financials.ts --apply --plan "<plan.json>" --expect-rows N --expect new`.');
  return new PrismaClient();
}

function record(name: string, data: unknown) {
  const dir = path.resolve(process.cwd(), "../output/audits");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `financieros-pedidos-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

async function main() {
  const db = await client();
  try {
    if (!apply) {
      const plan = await orderFinancialsPlan(db);
      console.log(JSON.stringify({ aEscribir: plan.rows.length, revisionManual: plan.manualReview.length, motivosRevision: plan.manualReview.map((row) => row.reason) }, null, 2));
      const file = record("plan", { rows: plan.rows, manualReview: plan.manualReview });
      console.log(`plan: ${file}`);
      console.log(`Ensayo: se escribirían ${plan.rows.length} pedidos. Para aplicar: --apply --plan "${file}" --expect-rows ${plan.rows.length}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (!planPath) throw new Error("falta --plan <plan.json> (el que guardó el ensayo); no se escribe nada.");
    if (expectRows === undefined || Number.isNaN(expectRows)) throw new Error("falta --expect-rows N (el N del ensayo); no se escribe nada.");
    const expected = JSON.parse(readFileSync(planPath, "utf8")) as Pick<OrderFinancialsPlan, "rows">;
    const result = await applyOrderFinancialsBackfill(expected, expectRows, (work) => db.$transaction((tx) => work(tx), { timeout: 60_000, maxWait: 10_000 }));
    console.log(`pedidos con financieros: ${result.written}`);
    console.log(`registro: ${record("aplicado", expected)}`);
    console.log(`PROD_WRITE_ROWS=${result.written}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
