/**
 * Reservas v2: un ítem por cada reserva que aún no tiene (reglas y
 * verificación en `scripts/lib/reservation-items-backfill.mjs`). Solo imprime
 * conteos: ni nombres, ni teléfonos, ni productos.
 *
 * REQUISITO: la migración `prisma/manual-migrations/20261015_add_stock_reservation_items.sql`
 * aplicada y el código de la fase 1 desplegado (escribe ítems para las
 * reservas nuevas; esto cubre las anteriores).
 *
 *   node --env-file=.env scripts/backfill-reservation-items.mjs
 *       ENSAYO con el usuario de solo lectura: cuántas faltan y cómo queda hoy.
 *   npm run prod:write -- scripts/backfill-reservation-items.mjs --apply --expect new
 *       Escribe e imprime la verificación. Idempotente: otra corrida escribe 0.
 *
 * `--store <storeId>` limita a una tienda; sin él cubre todas.
 */
import { createRequire } from "node:module";

import { applyReservationItemsBackfill, planReservationItemsBackfill, verifyReservationItems } from "./lib/reservation-items-backfill.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const storeFlag = args.indexOf("--store");
const storeId = storeFlag === -1 ? null : args[storeFlag + 1];
const known = new Set(["--apply", "--store", storeId]);
const unknown = args.filter((arg) => !known.has(arg));
if (unknown.length || (storeFlag !== -1 && (!storeId || storeId.startsWith("--")))) {
  throw new Error(`uso: [--apply] [--store <storeId>] (no entiendo: ${unknown.join(" ") || "--store sin valor"})`);
}

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-reservation-items.mjs --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient({ log: [] });
}

try {
  const scope = { storeId };
  const plan = await planReservationItemsBackfill(db, scope);
  console.log(`Alcance: ${storeId ?? "todas las tiendas"} · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  console.log(`Reservas sin ítems: ${plan.missing.length}`);
  if (!apply) {
    console.log(`Antes: ${JSON.stringify(await verifyReservationItems(db, scope))}`);
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await applyReservationItemsBackfill(db, plan);
    console.log(`Ítems escritos: ${written}`);
    console.log(`PROD_WRITE_ROWS=${written}`);
    console.log(`Después: ${JSON.stringify(await verifyReservationItems(db, scope))}`);
  }
} finally {
  await db.$disconnect();
}
