/**
 * Corrige «Envío y otros gastos por unidad» (`Product.transportationCost`) con
 * la regla que aprobó Paula el 2026-10-16: el envío real por unidad de la
 * última recepción, repartido como la recepción; sin recepción, null («no
 * registrado»). El plan sale de `tmp/transporte-plan.ts` (solo lectura) y vive
 * fuera del repositorio porque trae cifras del negocio.
 *
 *   npx tsx --env-file=.env scripts/fix-transportation-cost.ts <plan.json> [--excepciones <excepciones.json>]
 *       ENSAYO con el usuario de lectura: cuenta lo que se escribiría y avisa si
 *       algún producto ya no tiene el valor esperado. No escribe.
 *   npm run prod:write -- scripts/fix-transportation-cost.ts <plan.json> --apply --expect-rows N --expect new
 *       Escribe en una transacción. Cada producto se actualiza solo si todavía
 *       tiene exactamente el valor esperado; si uno no coincide o el total no es
 *       N, no se escribe nada.
 *
 * De las excepciones solo entran las que Paula marcó «aplicar» u «otro valor».
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { buildTransportWrites, type ExceptionDecision, type RuleRow, type TransportWrite } from "../lib/transportation-cost-plan";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const planPath = args.find((arg, index) => !arg.startsWith("--") && !["--excepciones", "--expect-rows"].includes(args[index - 1] ?? ""));
if (!planPath) throw new Error("uso: <plan.json> [--excepciones <excepciones.json>] [--apply --expect-rows N]");
const exceptionsPath = valueOf("--excepciones");
const expectRows = valueOf("--expect-rows");

const rule = JSON.parse(readFileSync(planPath, "utf8")) as RuleRow[];
const exceptions = exceptionsPath ? (JSON.parse(readFileSync(exceptionsPath, "utf8")) as ExceptionDecision[]) : [];
const { writes, counts } = buildTransportWrites(rule, exceptions);

async function client(): Promise<PrismaClient> {
  if (process.env.PROD_WRITE_APPROVED === "1") {
    const { createProdClient } = (await import("./lib/prod-client.mjs")) as unknown as { createProdClient: () => PrismaClient };
    return createProdClient();
  }
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/fix-transportation-cost.ts <plan.json> --apply --expect-rows N --expect new`.");
  return new PrismaClient();
}

/** Mismo valor esperado y mismo valor nuevo: una sola actualización por grupo. */
function groupWrites(list: TransportWrite[]) {
  const groups = new Map<string, { expected: number | null; value: number | null; ids: string[] }>();
  for (const write of list) {
    const key = `${write.expected}→${write.value}`;
    const group = groups.get(key) ?? { expected: write.expected, value: write.value, ids: [] };
    group.ids.push(write.id);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

async function main() {
  const db = await client();
  try {
    const current = new Map<string, number | null>();
    for (let start = 0; start < writes.length; start += 500) {
      const chunk = writes.slice(start, start + 500).map((write) => write.id);
      for (const row of await db.product.findMany({ where: { id: { in: chunk } }, select: { id: true, transportationCost: true } })) current.set(row.id, row.transportationCost);
    }
    const missing = writes.filter((write) => !current.has(write.id));
    const drift = writes.filter((write) => current.has(write.id) && current.get(write.id) !== write.expected);
    console.log(JSON.stringify({ ...counts, aEscribir: writes.length, aNoRegistrado: writes.filter((write) => write.value === null).length, noExisten: missing.length, cambiaronDesdeElPlan: drift.length }, null, 2));
    if (missing.length || drift.length) throw new Error("Algún producto no existe o cambió desde el plan. Vuelve a generar el plan; no se escribe nada.");

    if (!apply) {
      console.log(`Ensayo: se escribirían ${writes.length} productos. Para aplicar: --apply --expect-rows ${writes.length}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (expectRows === undefined || Number(expectRows) !== writes.length) {
      throw new Error(`--expect-rows ${expectRows ?? "(falta)"} no coincide con las ${writes.length} filas del plan; no se escribe nada.`);
    }
    const written = await db.$transaction(
      async (tx) => {
        let count = 0;
        for (const group of groupWrites(writes)) {
          const result = await tx.product.updateMany({ where: { id: { in: group.ids }, transportationCost: group.expected }, data: { transportationCost: group.value } });
          if (result.count !== group.ids.length) throw new Error(`Se esperaban ${group.ids.length} productos con ${group.expected} y se actualizaron ${result.count}; no se escribe nada.`);
          count += result.count;
        }
        return count;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
