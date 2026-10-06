/**
 * Cambia el plazo de entrega que se le promete a la clienta:
 * `StoreSettings.deliveryEstimate` de la tienda principal, «2 a 4 días
 * hábiles» → «2 a 6 días hábiles» (ola 3, fase 2A, §A.3 de
 * docs/seo/2026-10-05-wave-3-phase-2-proposals.md). Se cuenta desde que se
 * confirma el pago: 0–1 día de preparación más 2–5 de tránsito, lo mismo que
 * declara Merchant Center. Solo ese campo de esa fila.
 *
 * Orden: primero el deploy del texto nuevo de la tienda (la página de envíos
 * ya dice «desde que se confirma el pago»), después este cambio.
 *
 *   node --env-file=.env scripts/update-delivery-estimate.mjs [--dry-run]
 *       Solo lectura (pdepapel_ro): comprueba, guarda la copia del valor
 *       actual en ~/pdepapel-backups/<fecha>/ y muestra el cambio.
 *   npm run prod:write -- scripts/update-delivery-estimate.mjs --apply <copia.json>
 *   npm run prod:write -- scripts/update-delivery-estimate.mjs --revert <copia.json>
 *       Escritura con aprobación fresca. Una transacción; tiene que cambiar
 *       exactamente 1 fila y solo si el valor actual es el esperado (el de la
 *       copia al aplicar, el nuevo al revertir). Si no, no se escribe nada.
 *
 * Al guardar, la tienda lo ve en 5–10 minutos (`storefront-settings` con
 * revalidate 300); el bot de WhatsApp lee la base y cambia al instante.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const EXPECTED_CURRENT = "2 a 4 días hábiles";
const NEXT_VALUE = "2 a 6 días hábiles";
/** Tope de la columna en el formulario (lib/store-settings.ts). */
const MAX_LENGTH = 120;

const [mode = "--dry-run", backupArg] = process.argv.slice(2);
if (!["--dry-run", "--apply", "--revert"].includes(mode)) throw new Error("uso: [--dry-run] | --apply <copia.json> | --revert <copia.json>");
if (mode !== "--dry-run" && !backupArg) throw new Error(`${mode} necesita la copia de respaldo del ensayo`);
if (!NEXT_VALUE.trim() || NEXT_VALUE.length > MAX_LENGTH) throw new Error("el valor nuevo no es válido");

let db;
if (mode === "--dry-run") {
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
} else {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
}

try {
  const current = await db.storeSettings.findUnique({ where: { storeId: STORE_ID }, select: { id: true, storeId: true, deliveryEstimate: true } });
  if (!current) throw new Error("la tienda no tiene StoreSettings");

  if (mode === "--dry-run") {
    if (current.deliveryEstimate !== EXPECTED_CURRENT) {
      throw new Error(`el valor actual es ${JSON.stringify(current.deliveryEstimate)}, no ${JSON.stringify(EXPECTED_CURRENT)}: no se prepara nada`);
    }
    const takenAt = new Date().toISOString();
    const dir = join(homedir(), "pdepapel-backups", takenAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const backupPath = join(dir, `delivery-estimate-${takenAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(backupPath, JSON.stringify({ takenAt, storeId: STORE_ID, id: current.id, deliveryEstimate: current.deliveryEstimate }, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ mode, id: current.id, deliveryEstimate: `${JSON.stringify(current.deliveryEstimate)} → ${JSON.stringify(NEXT_VALUE)}`, backup: backupPath }, null, 1));
  } else {
    const backup = JSON.parse(readFileSync(backupArg, "utf8"));
    if (backup.storeId !== STORE_ID || backup.id !== current.id) throw new Error("la copia no corresponde a esta tienda");
    const [expected, next] = mode === "--apply" ? [backup.deliveryEstimate, NEXT_VALUE] : [NEXT_VALUE, backup.deliveryEstimate];

    const updated = await db.$transaction(
      async (tx) => {
        const result = await tx.storeSettings.updateMany({
          where: { id: backup.id, storeId: STORE_ID, deliveryEstimate: expected },
          data: { deliveryEstimate: next },
        });
        if (result.count !== 1) throw new Error(`se esperaba 1 fila con ${JSON.stringify(expected)}, se actualizaron ${result.count}. No se escribió nada.`);
        return result.count;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    const after = await db.storeSettings.findUnique({ where: { storeId: STORE_ID }, select: { deliveryEstimate: true } });
    console.log(`PROD_WRITE_ROWS=${updated}`);
    console.log(JSON.stringify({ mode, updated, deliveryEstimate: after?.deliveryEstimate }, null, 1));
  }
} finally {
  await db.$disconnect();
}
