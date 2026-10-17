/**
 * «Envío y otros gastos por unidad» en 0 exacto, en productos activos que no son
 * kits (decisiones de Christian, 2026-10-17): una variante toma el único valor
 * real de sus hermanas activas; si sus hermanas tienen valores distintos, ninguno
 * real, o el producto está suelto, queda null («no registrado»). Archivados y
 * kits no se tocan. Lógica en `lib/transportation-zero-fix.ts`.
 *
 *   npx tsx --env-file=.env scripts/fix-transportation-zero.ts
 *       ENSAYO con el usuario de lectura: cuenta «desde hermana» y «a no
 *       registrado» y guarda el plan en output/audits/ (local, ignorado). No escribe.
 *   npm run prod:write -- scripts/fix-transportation-zero.ts --apply --plan <plan.json> --expect-rows N --expect new
 *       En una transacción vuelve a calcular el plan: tiene que ser idéntico al
 *       del ensayo (mismas filas, mismos valores de las hermanas) y sumar N, y
 *       cada fila se escribe solo si sigue en 0. Si algo no coincide, nada.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { applyZeroTransportFix, zeroTransportPlan, type ZeroTransportPlan } from "../lib/transportation-zero-fix";

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
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/fix-transportation-zero.ts --apply --plan <plan.json> --expect-rows N --expect new`.");
  return new PrismaClient();
}

function record(name: string, data: unknown) {
  const dir = path.resolve(process.cwd(), "../output/audits");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `transporte-cero-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

async function main() {
  const db = await client();
  try {
    if (!apply) {
      const plan = await zeroTransportPlan(db);
      const total = plan.fromSibling.length + plan.toNull.length;
      console.log(
        JSON.stringify(
          {
            desdeHermana: plan.fromSibling.length,
            aNoRegistrado: plan.toNull.length,
            deEllosHermanasEnConflicto: plan.conflicts,
            aEscribir: total,
            kitsFuera: plan.kitsFuera,
            archivadosFuera: plan.archivadosFuera,
          },
          null,
          2,
        ),
      );
      const file = record("plan", { fromSibling: plan.fromSibling, toNull: plan.toNull });
      console.log(`plan: ${file}`);
      console.log(`Ensayo: se escribirían ${total} productos. Para aplicar: --apply --plan ${file} --expect-rows ${total}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (!planPath) throw new Error("falta --plan <plan.json> (el que guardó el ensayo); no se escribe nada.");
    if (expectRows === undefined || Number.isNaN(expectRows)) throw new Error("falta --expect-rows N (el N del ensayo); no se escribe nada.");
    const expected = JSON.parse(readFileSync(planPath, "utf8")) as Pick<ZeroTransportPlan, "fromSibling" | "toNull">;
    const result = await applyZeroTransportFix(expected, expectRows, (work) => db.$transaction((tx) => work(tx), { timeout: 60_000, maxWait: 10_000 }));
    console.log(`desde hermana: ${result.fromSibling} · a no registrado: ${result.toNull}`);
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
