/**
 * Paso «c» del bloque D (issue #3), en una sola transacción:
 *   - backfill de `Color.swatchType` (13 colores; «Pastel» → MULTICOLOR_PASTEL),
 *   - los hex de «Azul fluorescente» y «Morado fluorescente» que eligió Paula,
 *   - unir «Neón» en «Fluorescente» (`mergeAttributes`; «Neón» queda archivado).
 *
 * Ensayo (no escribe; vale con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/color-swatch-rollout.ts --blue-hex '#1E90FF' --purple-hex '#D946EF'
 *
 * Escritura (aprobación fresca de Christian):
 *   npm run prod:write -- scripts/color-swatch-rollout.ts --blue-hex '#1E90FF' --purple-hex '#D946EF' --apply --expect new
 *
 * Los hex no tienen valor por defecto: sin ellos no corre. Antes de escribir
 * imprime los valores de antes de cada fila tocada y los anota, junto con el
 * SQL para deshacerlo, en `ops/prod-writes.log`. Las precondiciones son las
 * del ensayo del 2026-10-07; si la base ya no está así, no escribe nada.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { applyColorRollout, parseHexArg, planColorRollout, rollbackSql, type RolloutInput } from "./lib/color-swatch-rollout";
import { createProdClient } from "./lib/prod-client.mjs";

const PRODUCTION_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

/** Lo que mostró el ensayo del 2026-10-07 en la base nueva. */
const PRODUCTION_EXPECTATIONS = {
  colorCount: 36,
  blueHex: "#2b5b99",
  purpleHex: "#9f598f",
  neonProductIds: ["5efda3e9-6e56-4644-9560-f4e52e8f8e76", "8d6ea3eb-fc3b-437a-8458-27420d5407f6"],
  fluorescentActiveProducts: 4,
};

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) {
    throw new Error("--apply solo corre con `npm run prod:write -- scripts/color-swatch-rollout.ts … --apply --expect new`.");
  }
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") {
    throw new Error("este guion solo escribe en la base nueva (--expect new).");
  }
  const storeId = argValue(args, "--store") ?? PRODUCTION_STORE_ID;
  const input: RolloutInput = {
    storeId,
    newBlueHex: parseHexArg(argValue(args, "--blue-hex"), "--blue-hex"),
    newPurpleHex: parseHexArg(argValue(args, "--purple-hex"), "--purple-hex"),
    expect: PRODUCTION_EXPECTATIONS,
  };

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    const plan = await planColorRollout(db, input);
    console.log(`Tienda ${storeId} · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
    console.log("\nValores de antes (filas que se tocan):");
    for (const color of plan.before.colors) {
      console.log(`  Color ${color.id} «${color.name}» value=${color.value} swatchType=${color.swatchType} isArchived=${color.isArchived} updatedAt=${color.updatedAt.toISOString()}`);
    }
    for (const product of plan.before.products) {
      console.log(`  Product ${product.id} «${product.name}» colorId=${product.colorId} updatedAt=${product.updatedAt.toISOString()}`);
    }
    console.log("\nCambios:");
    for (const change of plan.changes.swatchTypes) console.log(`  swatchType «${change.name}»: ${change.from} → ${change.to}`);
    for (const change of plan.changes.hex) console.log(`  hex «${change.name}»: ${change.from} → ${change.to}`);
    if (plan.changes.merge) {
      console.log(`  unir «Neón» (${plan.changes.merge.sourceId}) en «Fluorescente» (${plan.changes.merge.targetId}): ${plan.changes.merge.productIds.length} productos; «Neón» queda archivado`);
    }
    const rollback = rollbackSql(plan.before);
    console.log("\nSQL para deshacer:");
    for (const statement of rollback) console.log(`  ${statement}`);

    if (plan.problems.length > 0) {
      console.log(`\nPRECONDICIONES ROTAS (no se escribe nada):\n- ${plan.problems.join("\n- ")}`);
      console.log("PROD_WRITE_ROWS=0");
      process.exitCode = 1;
      return;
    }
    console.log("\nPrecondiciones: OK");
    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    // Antes de escribir: los valores de antes y el SQL para deshacer quedan en
    // el registro versionado, aunque la corrida se corte a mitad.
    const at = new Date().toISOString();
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [
        `# ${at} color-swatch-rollout ANTES ${JSON.stringify(plan.before)}`,
        ...rollback.map((statement) => `# ${at} color-swatch-rollout DESHACER ${statement}`),
        "",
      ].join("\n"),
    );

    const result = await db.$transaction((tx) => applyColorRollout(tx, input), { timeout: 30_000 });
    console.log(`\nAplicado: ${result.swatchTypes} swatchType, ${result.hex} hex, ${result.moved} productos movidos, ${result.archived} color archivado.`);
    console.log(`PROD_WRITE_ROWS=${result.swatchTypes + result.hex + result.moved + result.archived}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`color-swatch-rollout: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
