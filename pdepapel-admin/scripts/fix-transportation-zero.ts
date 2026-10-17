/**
 * «Envío y otros gastos por unidad» en 0 exacto → null («no registrado») en los
 * productos activos que no son kits (decisión de Christian, 2026-10-17). Los
 * archivados y los kits no se tocan. Lógica en `lib/transportation-zero-fix.ts`.
 *
 *   npx tsx --env-file=.env scripts/fix-transportation-zero.ts
 *       ENSAYO con el usuario de lectura: cuenta cuántos se escribirían (N). No escribe.
 *   npm run prod:write -- scripts/fix-transportation-zero.ts --apply --expect-rows N --expect new
 *       En una transacción, vuelve a buscar los activos en 0, exige que sean
 *       exactamente N y escribe null solo donde todavía hay 0; si no, nada.
 *
 * La lista de ids queda en output/audits/ (local, ignorado), en el ensayo y al aplicar.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { applyZeroTransportFix, zeroTransportPlan } from "../lib/transportation-zero-fix";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectIndex = args.indexOf("--expect-rows");
const expectRows = expectIndex >= 0 ? Number(args[expectIndex + 1]) : undefined;

async function client(): Promise<PrismaClient> {
  if (process.env.PROD_WRITE_APPROVED === "1") {
    const { createProdClient } = (await import("./lib/prod-client.mjs")) as unknown as { createProdClient: () => PrismaClient };
    return createProdClient();
  }
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/fix-transportation-zero.ts --apply --expect-rows N --expect new`.");
  return new PrismaClient();
}

function record(kind: "ensayo" | "aplicado", ids: string[]) {
  const dir = path.resolve(process.cwd(), "../output/audits");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `transporte-cero-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(ids, null, 2)}\n`);
  return file;
}

async function main() {
  const db = await client();
  try {
    if (!apply) {
      const plan = await zeroTransportPlan(db);
      console.log(JSON.stringify({ aEscribir: plan.ids.length, kitsFuera: plan.kitsFuera, archivadosFuera: plan.archivadosFuera }, null, 2));
      console.log(`ids: ${record("ensayo", plan.ids)}`);
      console.log(`Ensayo: se escribirían ${plan.ids.length} productos. Para aplicar: --apply --expect-rows ${plan.ids.length}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (expectRows === undefined || Number.isNaN(expectRows)) throw new Error("falta --expect-rows N (el N del ensayo); no se escribe nada.");
    const ids = await applyZeroTransportFix(expectRows, (work) => db.$transaction((tx) => work(tx), { timeout: 60_000, maxWait: 10_000 }));
    console.log(`ids: ${record("aplicado", ids)}`);
    console.log(`PROD_WRITE_ROWS=${ids.length}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
