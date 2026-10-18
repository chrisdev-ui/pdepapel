/**
 * Datos iniciales de marcas (feat/marcas). Regla en `lib/brand-initial-data.ts`.
 * La configuración (marcas a crear y la decisión por cada texto anterior) vive
 * en un JSON local sin rastrear, por defecto `tmp/brands-initial.json`.
 *
 *   npx tsx --env-file=.env scripts/brands-initial-data.ts [--config tmp/brands-initial.json]
 *       ENSAYO con el usuario de lectura (después de aplicar la migración
 *       20261017_add_brands.sql): cuenta marcas a crear, grupos y productos a
 *       asignar y los de revisión manual, y guarda el plan (ids y nombres de
 *       marca, nada de clientas) en output/audits/ (local, ignorado). No escribe.
 *   npm run prod:write -- scripts/brands-initial-data.ts --apply --plan "<plan.json>" --expect-rows N --expect new
 *       En una transacción vuelve a calcular el plan: tiene que ser idéntico al
 *       del ensayo y sumar N; cada grupo o producto se escribe solo si sigue
 *       sin marca. Si algo no coincide, nada. Idempotente: después del push se
 *       vuelve a correr el ensayo y solo encuentra lo nuevo.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  applyBrandInitialPlan,
  loadBrandInitialPlan,
  type BrandInitialConfig,
  type BrandInitialPlan,
} from "../lib/brand-initial-data";
import { normalizeBrandName } from "../lib/product-naming";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueOf = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const expectRows = valueOf("--expect-rows") === undefined ? undefined : Number(valueOf("--expect-rows"));
const planPath = valueOf("--plan");
const configPath = path.resolve(process.cwd(), valueOf("--config") ?? "tmp/brands-initial.json");

async function client(): Promise<PrismaClient> {
  if (process.env.PROD_WRITE_APPROVED === "1") {
    if (process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");
    const { createProdClient } = (await import("./lib/prod-client.mjs")) as unknown as { createProdClient: () => PrismaClient };
    return createProdClient();
  }
  if (apply) throw new Error('--apply solo corre con `npm run prod:write -- scripts/brands-initial-data.ts --apply --plan "<plan.json>" --expect-rows N --expect new`.');
  return new PrismaClient();
}

function record(name: string, data: unknown) {
  const dir = path.resolve(process.cwd(), "../output/audits");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `marcas-iniciales-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function summary(plan: BrandInitialPlan) {
  const byBrand = new Map<string, number>();
  for (const row of plan.productAssignments) byBrand.set(row.brand, (byBrand.get(row.brand) ?? 0) + 1);
  const reasons = new Map<string, number>();
  for (const row of plan.manualReview) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  return {
    marcasACrear: plan.createBrands.map((brand) => brand.name),
    gruposAAsignar: plan.groupAssignments.length,
    productosAAsignar: plan.productAssignments.length,
    productosPorMarca: Object.fromEntries(byBrand),
    revisionManual: plan.manualReview.length,
    motivosRevision: Object.fromEntries(reasons),
    filas: plan.rows,
  };
}

async function main() {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as BrandInitialConfig;
  const db = await client();
  try {
    if (!apply) {
      const plan = await loadBrandInitialPlan(db, config, normalizeBrandName);
      console.log(JSON.stringify(summary(plan), null, 2));
      const file = record("plan", plan);
      console.log(`plan: ${file}`);
      console.log(`Ensayo: se escribirían ${plan.rows} filas. Para aplicar: --apply --plan "${file}" --expect-rows ${plan.rows}`);
      console.log("PROD_WRITE_ROWS=0");
      return;
    }
    if (!planPath) throw new Error("falta --plan <plan.json> (el que guardó el ensayo); no se escribe nada.");
    if (expectRows === undefined || Number.isNaN(expectRows)) throw new Error("falta --expect-rows N (el N del ensayo); no se escribe nada.");
    const expected = JSON.parse(readFileSync(planPath, "utf8")) as BrandInitialPlan;
    const result = await db.$transaction(
      (tx) => applyBrandInitialPlan(tx, config, normalizeBrandName, expected, expectRows, "script:brands-initial-data"),
      { timeout: 60_000, maxWait: 10_000 },
    );
    console.log(`marcas creadas: ${result.brandsCreated} · grupos: ${result.groupsWritten} · productos: ${result.productsWritten}`);
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
