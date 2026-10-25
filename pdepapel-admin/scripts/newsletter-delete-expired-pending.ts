/**
 * Borrado único de las altas del boletín que siguen PENDIENTES después de 7
 * días (unas 87 el 2026-10-25). Es la misma función que corre el cron diario
 * `newsletter-retention`; esta corrida limpia lo acumulado antes del cron.
 * Nunca toca activos, dados de baja ni bloqueados. Solo imprime conteos.
 *
 * Ensayo (no escribe; corre con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/newsletter-delete-expired-pending.ts [--store <storeId>]
 * Escritura (después del despliegue, con el token de Christian):
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/newsletter-delete-expired-pending.ts --apply --expect new [--store <storeId>]
 *
 * Sin copia local a propósito: son correos de personas que nunca dieron su
 * consentimiento y guardar menos es el objetivo. Si hiciera falta volver
 * atrás, está el respaldo diario de la base (AGENTS.md › «Cómo restaurar»).
 */
import { PrismaClient } from "@prisma/client";

import { deleteExpiredPendingNewsletterSignups } from "@/lib/newsletter-retention";

import { createProdClient } from "./lib/prod-client.mjs";

const DEFAULT_STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const storeFlag = args.indexOf("--store");
  const storeId = storeFlag === -1 ? DEFAULT_STORE_ID : args[storeFlag + 1];
  const known = new Set(["--apply", "--store", storeId]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length || !storeId || storeId.startsWith("--")) {
    throw new Error(`uso: [--apply] [--store <storeId>] (no entiendo: ${unknown.join(" ") || "--store sin valor"})`);
  }

  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/newsletter-delete-expired-pending.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    if (!viaProdWrite) {
      const [{ user }] = await db.$queryRawUnsafe<{ user: string }[]>("SELECT CURRENT_USER() AS user");
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
      if (!local && !user.startsWith("pdepapel_ro@")) throw new Error("el ensayo contra producción corre solo con pdepapel_ro.");
    }

    const result = await deleteExpiredPendingNewsletterSignups(db, { storeId, dryRun: !apply });
    console.log(JSON.stringify({
      modo: apply ? "APLICAR" : "ENSAYO",
      tienda: storeId,
      pendientesCreadasAntesDe: result.cutoff.toISOString(),
      encontradas: result.matched,
      borradas: result.deleted,
    }, null, 1));
    console.log(`PROD_WRITE_ROWS=${result.deleted}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`newsletter-delete-expired-pending: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
