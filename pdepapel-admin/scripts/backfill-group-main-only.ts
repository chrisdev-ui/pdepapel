/**
 * Respaldo «portada solo del grupo» (2026-10-21): la foto principal de cada
 * grupo deja de estar en las galerías de las variantes que tienen otra foto.
 * El plan está en `lib/group-cover-backfill.ts` (probado con datos armados).
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/backfill-group-main-only.ts [--out output/archivo.json]
 * Escritura (después del despliegue del código, con el token de Christian):
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/backfill-group-main-only.ts --apply --expect new
 *
 * Antes de escribir anota en `ops/prod-writes.log` una línea DESHACER por cada
 * cambio (filas borradas, portadas y alcances). Todo va en una transacción.
 * Idempotente: una segunda pasada no encuentra filas de portada en variantes
 * con otras fotos ni alcances sin marcar. No toca Mercado Libre: las
 * publicaciones toman las fotos nuevas en su sincronización normal.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { applyGroupCoverBackfill, BACKFILL_GROUP_SELECT, planGroupCoverBackfill, undoStatements, type BackfillGroup } from "@/lib/group-cover-backfill";

import { createProdClient } from "./lib/prod-client.mjs";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-group-main-only.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }
    const groups = (await db.productGroup.findMany({
      select: BACKFILL_GROUP_SELECT,
    })) as BackfillGroup[];

    const plan = planGroupCoverBackfill(groups);
    const live = new Set(groups.flatMap((group) => group.products.filter((product) => !product.isArchived).map((product) => product.id)));
    const touchedLive = plan.touchedProductIds.filter((id) => live.has(id)).length;
    const report = {
      modo: apply ? "APLICAR" : "ENSAYO",
      grupos: groups.length,
      portadasAMarcar: plan.scopeUpdates.length,
      variantesQueSeLimpian: plan.touchedProductIds.length,
      variantesVivasQueSeLimpian: touchedLive,
      filasABorrar: plan.deletions.length,
      filasABorrarCopia: plan.deletions.filter((row) => row.origin === "GROUP_COPY").length,
      filasABorrarPropia: plan.deletions.filter((row) => row.origin !== "GROUP_COPY").length,
      portadasDeVarianteQueCambian: plan.coverChanges.length,
      variantesQueSeQuedanConLaPortada: plan.skipped.length,
      vivasQueSeQuedanConLaPortada: plan.skipped.filter((item) => !item.isArchived).length,
    };
    console.log(JSON.stringify(report, null, 1));
    console.log("\nSe quedan con la portada de respaldo (vivas), por grupo:");
    for (const item of plan.skipped.filter((entry) => !entry.isArchived)) console.log(`  ${item.group} — ${item.variant} (${item.sku ?? "sin SKU"})`);
    if (outFile) writeFileSync(outFile, JSON.stringify({ report, skipped: plan.skipped, touchedProductIds: plan.touchedProductIds }, null, 1));

    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const at = new Date().toISOString();
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [...undoStatements(plan).map((statement) => `# ${at} backfill-group-main-only DESHACER ${statement}`), ""].join("\n"),
    );
    const written = await db.$transaction((tx) => applyGroupCoverBackfill(tx, plan), { timeout: 600_000, maxWait: 30_000 });
    console.log(`\nAplicado: ${written} cambios. Variantes tocadas: ${plan.touchedProductIds.length} (la tienda las muestra nuevas al vencer su caché).`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`backfill-group-main-only: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
