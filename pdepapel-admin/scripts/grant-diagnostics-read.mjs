/**
 * Da a `pdepapel_ro` lo justo para diagnosticar memoria y conexiones de MySQL
 * (incidente OOM 2026-10-09): SELECT en performance_schema y sys, y PROCESS
 * para ver las conexiones de los demás usuarios. Nada más.
 *
 *   npm run prod:write -- scripts/grant-diagnostics-read.mjs --expect new
 *
 * Revertir: REVOKE SELECT ON performance_schema.* / sys.* y REVOKE PROCESS
 * ON *.* FROM pdepapel_ro, con el mismo envoltorio.
 */
import { databaseIdentityOf } from "./lib/db-identity.mjs";

const fail = (message) => {
  console.error(`grant-diagnostics-read: ${message}`);
  process.exit(2);
};
if (process.env.PROD_WRITE_APPROVED !== "1") fail("solo corre con `npm run prod:write -- scripts/grant-diagnostics-read.mjs --expect new`.");
if (process.env.PROD_WRITE_EXPECT !== "new") fail("solo para la base nueva (--expect new).");

const { createProdClient } = await import("./lib/prod-client.mjs");
const db = createProdClient();

try {
  const identity = await databaseIdentityOf(db);
  if (identity !== "new") fail(`la base no es la nueva (marca: ${identity}). No se tocó nada.`);

  const accounts = await db.$queryRawUnsafe("SELECT Host AS host FROM mysql.user WHERE User = 'pdepapel_ro'");
  if (accounts.length !== 1) fail(`se esperaba una sola cuenta pdepapel_ro y hay ${accounts.length}. No se tocó nada.`);
  const account = `'pdepapel_ro'@'${String(accounts[0].host).replace(/'/g, "")}'`;

  for (const statement of [
    `GRANT SELECT ON performance_schema.* TO ${account}`,
    `GRANT SELECT ON sys.* TO ${account}`,
    `GRANT PROCESS ON *.* TO ${account}`,
  ]) {
    await db.$executeRawUnsafe(statement);
    console.log(`ok: ${statement}`);
  }

  const grants = await db.$queryRawUnsafe(`SHOW GRANTS FOR ${account}`);
  for (const row of grants) console.log(Object.values(row)[0]);
} finally {
  await db.$disconnect();
}
