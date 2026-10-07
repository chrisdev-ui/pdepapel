/**
 * Backfill único de `Color.swatchType` (issue #3): marca los 13 colores no
 * sólidos de la auditoría 2026-10-06 (mapa en `scripts/lib/color-swatch-backfill.mjs`).
 * El resto se queda en SOLID, el valor por defecto de la columna.
 *
 * REQUISITO: la migración `prisma/manual-migrations/20261007_add_color_swatch_type.sql`
 * ya aplicada en la base nueva (después del corte a us-east4). Sin la columna,
 * el guion falla en la primera lectura y no escribe nada.
 *
 *   npm run prod:write -- scripts/backfill-color-swatch-type.mjs --expect new [--store <storeId>]
 *       ENSAYO (por defecto): lee y muestra, color por color, el tipo actual y
 *       el propuesto. No escribe. Imprime PROD_WRITE_ROWS=0.
 *   npm run prod:write -- scripts/backfill-color-swatch-type.mjs --apply --expect new [--store <storeId>]
 *       Escribe en una sola transacción. Cada fila se actualiza por id, tienda
 *       y tipo actual (el que vio el plan), y tiene que cambiar exactamente 1;
 *       si no, se revierte todo. Idempotente: una segunda corrida encuentra
 *       los 13 ya marcados y escribe 0 filas.
 *
 * El ensayo también corre con el usuario de solo lectura, sin gastar una
 * aprobación: `node --env-file=.env scripts/backfill-color-swatch-type.mjs`.
 * `--apply` exige el envoltorio `prod:write` (cliente de `createProdClient`).
 *
 * La tienda lo ve sin desplegar: el guion no invalida la caché, así que las
 * fichas toman el tipo nuevo en ≤ 15 min (caché Redis de `GET /products`) +
 * 5 min (ISR). Para verlo antes, guardar cualquier color en el panel invalida
 * el catálogo entero.
 */
import { createRequire } from "node:module";

import { COLOR_SWATCH_TYPES, planColorSwatchBackfill } from "./lib/color-swatch-backfill.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const storeFlag = args.indexOf("--store");
const storeId = storeFlag === -1 ? DEFAULT_STORE_ID : args[storeFlag + 1];
const known = new Set(["--apply", "--store", storeId]);
const unknown = args.filter((arg) => !known.has(arg));
if (unknown.length || !storeId || storeId.startsWith("--")) {
  throw new Error(`uso: [--apply] [--store <storeId>] (no entiendo: ${unknown.join(" ") || "--store sin valor"})`);
}

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-color-swatch-type.mjs --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
}

try {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) throw new Error(`no existe la tienda ${storeId}`);

  const colors = await db.color.findMany({
    where: { storeId },
    select: { id: true, name: true, swatchType: true, isArchived: true },
    orderBy: { name: "asc" },
  });
  const plan = planColorSwatchBackfill(colors);
  for (const change of plan.changes) {
    if (!COLOR_SWATCH_TYPES.includes(change.to)) throw new Error(`tipo desconocido ${change.to}`);
  }

  console.log(`Tienda: ${store.name} (${store.id}) · ${colors.length} colores · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  for (const change of plan.changes) console.log(`  ${change.name}: ${change.from ?? "(vacío)"} → ${change.to}`);
  for (const row of plan.alreadySet) console.log(`  ${row.name}: ya es ${row.type} (no se toca)`);
  if (plan.missing.length) console.log(`  Aviso: la tienda no tiene ${plan.missing.map((name) => `«${name}»`).join(", ")} (no se hace nada con ellos).`);
  console.log(`Cambios: ${plan.changes.length} · ya marcados: ${plan.alreadySet.length} · resto en SOLID: ${colors.length - plan.changes.length - plan.alreadySet.length}`);

  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await db.$transaction(
      async (tx) => {
        let count = 0;
        for (const change of plan.changes) {
          const result = await tx.color.updateMany({
            where: { id: change.id, storeId, swatchType: change.from },
            data: { swatchType: change.to },
          });
          if (result.count !== 1) {
            throw new Error(`«${change.name}» cambió desde el plan (se esperaba 1 fila en ${change.from}, hubo ${result.count}). No se escribió nada.`);
          }
          count += result.count;
        }
        return count;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    const after = await db.color.groupBy({ by: ["swatchType"], where: { storeId }, _count: { _all: true } });
    console.log(`PROD_WRITE_ROWS=${written}`);
    console.log(JSON.stringify(Object.fromEntries(after.map((row) => [row.swatchType, row._count._all])), null, 1));
  }
} finally {
  await db.$disconnect();
}
