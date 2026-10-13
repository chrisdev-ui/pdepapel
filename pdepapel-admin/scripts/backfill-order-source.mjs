/**
 * Backfill único de `Order.source` para los pedidos que se pueden clasificar
 * con certeza (reglas en `scripts/lib/order-source-backfill.mjs`). El resto
 * queda en `null` = desconocido. Solo imprime conteos por grupo: ni nombres,
 * ni teléfonos, ni correos, ni números de pedido.
 *
 * REQUISITO: la migración `prisma/manual-migrations/20261013_extend_order_source_pos_fair.sql`
 * ya aplicada (sin POS/FAIR en el enum, la escritura falla y se revierte todo).
 *
 *   npm run prod:write -- scripts/backfill-order-source.mjs --expect new [--store <storeId>]
 *       ENSAYO (por defecto): conteos por grupo, sin escribir. PROD_WRITE_ROWS=0.
 *   npm run prod:write -- scripts/backfill-order-source.mjs --apply --expect new [--store <storeId>]
 *       Escribe en una sola transacción, solo sobre filas que siguen sin
 *       origen. Idempotente: una segunda corrida escribe 0 filas.
 *
 * El ensayo también corre con el usuario de solo lectura:
 * `node --env-file=.env scripts/backfill-order-source.mjs`.
 * `--apply` exige el envoltorio `prod:write` con un motivo que nombre «Order».
 */
import { createRequire } from "node:module";

import { applyOrderSourceBackfill, ORDER_SOURCE_GROUPS, planOrderSourceBackfill } from "./lib/order-source-backfill.mjs";

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
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-order-source.mjs --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient({ log: [] });
}

try {
  const plan = await planOrderSourceBackfill(db, storeId);
  const classified = Object.values(plan.groups).reduce((sum, ids) => sum + ids.length, 0);
  console.log(`Tienda ${storeId} · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  console.log(`Pedidos sin origen: ${plan.withoutSource} · con certeza: ${classified} · quedan desconocidos: ${plan.unknown}`);
  for (const [group, ids] of Object.entries(plan.groups)) console.log(`  ${group} → ${ORDER_SOURCE_GROUPS[group]}: ${ids.length}`);

  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await applyOrderSourceBackfill(db, plan);
    const total = Object.values(written).reduce((sum, count) => sum + count, 0);
    console.log(`Escritas por grupo: ${JSON.stringify(written)}`);
    console.log(`PROD_WRITE_ROWS=${total}`);
    const after = await db.order.groupBy({ by: ["source"], where: { storeId }, _count: { _all: true } });
    console.log(JSON.stringify(Object.fromEntries(after.map((row) => [row.source ?? "null", row._count._all]))));
  }
} finally {
  await db.$disconnect();
}
