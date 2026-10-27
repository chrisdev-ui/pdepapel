/**
 * Libera, una vez, las conversaciones paradas en «es de Paula» por traspasos
 * del bot de antes del 2026-10-27 (reglas en `scripts/lib/needs-owner-release-backfill.mjs`).
 * Solo imprime conteos e ids internos: ni nombres, ni teléfonos, ni mensajes.
 *
 * REQUISITO: el código del lote «estabilidad del bot» desplegado (el bot
 * contesta en el paso 0 y medio a las que quedan en «owner_window»).
 *
 *   node --env-file=.env scripts/backfill-release-needs-owner.mjs
 *       ENSAYO con el usuario de solo lectura: cuántas, por antigüedad, y las
 *       líneas para deshacer en ~/pdepapel-backups/<fecha>/needs-owner-before.json.
 *   npm run prod:approve -- "Liberar conversaciones NEEDS_OWNER viejas (fix 6 del bot)"
 *   npm run prod:write -- scripts/backfill-release-needs-owner.mjs --apply --expect new
 *       Escribe en una transacción, comprueba el conteo y vuelve a planear (debe dar 0).
 *
 * `--store <storeId>` limita a una tienda; sin él cubre todas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { applyNeedsOwnerRelease, planNeedsOwnerRelease, summarizeByAge, undoStatements } from "./lib/needs-owner-release-backfill.mjs";

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
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-release-needs-owner.mjs --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient({ log: [] });
}

try {
  const now = new Date();
  const plan = await planNeedsOwnerRelease(db, { storeId, now });
  console.log(`Alcance: ${storeId ?? "todas las tiendas"} · modo ${apply ? "APLICAR" : "ENSAYO (sin escribir)"}`);
  console.log(`Conversaciones a liberar: ${plan.rows.length} · por último mensaje de Paula: ${JSON.stringify(summarizeByAge(plan.rows, now))}`);

  const dir = join(homedir(), "pdepapel-backups", now.toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  const backup = join(dir, apply ? "needs-owner-applied.json" : "needs-owner-before.json");
  writeFileSync(
    backup,
    JSON.stringify(
      {
        at: now.toISOString(),
        cutoff: plan.cutoff.toISOString(),
        rows: plan.rows.map((row) => ({ id: row.id, storeId: row.storeId, status: row.status, needsOwnerReason: row.needsOwnerReason, lastOwnerAt: row.lastOwnerAt })),
        DESHACER: undoStatements(plan.rows),
      },
      null,
      2,
    ),
  );
  console.log(`Respaldo y líneas para deshacer: ${backup}`);

  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await applyNeedsOwnerRelease(db, plan);
    console.log(`Conversaciones liberadas: ${written}`);
    console.log(`PROD_WRITE_ROWS=${written}`);
    const again = await planNeedsOwnerRelease(db, { storeId, now: new Date() });
    console.log(`Vuelta a planear (debe ser 0): ${again.rows.length}`);
  }
} finally {
  await db.$disconnect();
}
