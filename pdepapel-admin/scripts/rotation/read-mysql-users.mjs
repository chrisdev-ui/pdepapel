/**
 * Solo lectura, como root (incidente Railway 2026-10-21): lista las cuentas de
 * MySQL con su host, el último cambio de contraseña, si están bloqueadas y si
 * tienen contraseña secundaria. No imprime nada más.
 *
 *   npm run prod:approve -- "Leer mysql.user (solo lectura) por el incidente de Railway"
 *   npm run prod:write -- scripts/rotation/read-mysql-users.mjs --expect new
 */
import { databaseIdentityOf } from "../lib/db-identity.mjs";

if (process.env.PROD_WRITE_APPROVED !== "1" || process.env.PROD_WRITE_EXPECT !== "new") {
  console.error("read-mysql-users: solo corre con `npm run prod:write -- scripts/rotation/read-mysql-users.mjs --expect new`.");
  process.exit(2);
}

const { createProdClient } = await import("../lib/prod-client.mjs");
const db = createProdClient();
try {
  const identity = await databaseIdentityOf(db);
  if (identity !== "new") throw new Error(`la base no es la nueva (marca: ${identity})`);
  const rows = await db.$queryRawUnsafe(
    "SELECT User AS user, Host AS host, password_last_changed AS changed, account_locked AS locked, JSON_EXTRACT(User_attributes, '$.additional_password') IS NOT NULL AS secondary FROM mysql.user ORDER BY User, Host",
  );
  for (const row of rows) {
    const changed = row.changed instanceof Date ? row.changed.toISOString() : String(row.changed);
    console.log(`${row.user}@${row.host}\tcambio=${changed}\tbloqueada=${row.locked}\tsecundaria=${Number(row.secondary) ? "sí" : "no"}`);
  }
  console.log(`read-mysql-users: ${rows.length} cuenta(s).`);
  // Rotar root con RETAIN CURRENT PASSWORD exige APPLICATION_PASSWORD_ADMIN en la cuenta que lo hace.
  const grants = (await db.$queryRawUnsafe("SHOW GRANTS FOR CURRENT_USER()")).map((row) => String(Object.values(row)[0]));
  console.log(`read-mysql-users: cuenta actual ${grants.some((g) => /APPLICATION_PASSWORD_ADMIN/.test(g)) ? "TIENE" : "NO tiene"} APPLICATION_PASSWORD_ADMIN; ${grants.some((g) => /ALL PRIVILEGES ON \*\.\*/.test(g)) ? "tiene" : "no tiene"} ALL PRIVILEGES ON *.*.`);
} finally {
  await db.$disconnect();
}
