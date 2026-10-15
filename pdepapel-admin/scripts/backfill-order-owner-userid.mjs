/**
 * Pedidos con el id de la dueña como clienta (`Order.userId`): la dueña pasa a
 * `createdBy` y `userId` queda en null; `source` = PANEL solo con prueba
 * (reglas en `scripts/lib/order-owner-userid-backfill.mjs`). No envía correos
 * ni avisos. Solo imprime conteos: ni nombres, ni teléfonos, ni correos.
 *
 *   node --env-file=.env scripts/backfill-order-owner-userid.mjs
 *       ENSAYO con el usuario de solo lectura: conteos por grupo.
 *   npm run prod:write -- scripts/backfill-order-owner-userid.mjs --apply --expect-rows 516 --expect new
 *       Escribe en una transacción si el ensayo sigue dando exactamente
 *       `--expect-rows` pedidos. Idempotente: otra corrida no encuentra nada.
 *
 * `--apply` exige el envoltorio `prod:write` con un motivo que nombre «Order».
 */
import { createRequire } from "node:module";

import { applyOrderOwnerBackfill, assertExpectedRows, planOrderOwnerBackfill, verifyOrderOwnerBackfill } from "./lib/order-owner-userid-backfill.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const apply = args.includes("--apply");
const storeId = valueOf("--store") ?? DEFAULT_STORE_ID;
const expectRows = valueOf("--expect-rows");
const known = new Set(["--apply", "--store", "--expect-rows", storeId, expectRows]);
const unknown = args.filter((arg) => !known.has(arg));
if (unknown.length || !storeId || storeId.startsWith("--") || (args.includes("--expect-rows") && !/^\d+$/.test(expectRows ?? ""))) {
  throw new Error(`uso: [--apply --expect-rows <n>] [--store <storeId>] (no entiendo: ${unknown.join(" ") || "un valor"})`);
}
if (apply && expectRows === undefined) throw new Error("--apply necesita --expect-rows <n> con el conteo del ensayo.");

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-order-owner-userid.mjs --apply --expect-rows <n> --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient({ log: [] });
}

try {
  const plan = await planOrderOwnerBackfill(db, storeId);
  console.log(`Tienda ${storeId} · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  console.log(`Pedidos con la dueña como clienta: ${plan.ids.length} · sin creadora: ${plan.withoutCreator.length}`);
  for (const [bucket, count] of Object.entries(plan.buckets)) console.log(`  ${bucket}: ${count}${bucket === "panel_creado_pagado" ? " → PANEL" : " → origen null"}`);
  console.log(`Antes: ${JSON.stringify(await verifyOrderOwnerBackfill(db, storeId))}`);

  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    assertExpectedRows(plan, Number(expectRows));
    const written = await applyOrderOwnerBackfill(db, plan);
    console.log(`Escritos: ${JSON.stringify(written)}`);
    console.log(`PROD_WRITE_ROWS=${written.userId}`);
    console.log(`Después: ${JSON.stringify(await verifyOrderOwnerBackfill(db, storeId))}`);
  }
} finally {
  await db.$disconnect();
}
