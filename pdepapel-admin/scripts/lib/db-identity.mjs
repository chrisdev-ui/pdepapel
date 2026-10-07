/**
 * Pregunta a la base qué base es, antes de que `prod-write` ejecute nada.
 *
 * La nueva («MySQL US East», us-east4) tiene el esquema `migration_meta` con
 * la marca del corte; la vieja (us-west2) no. Es la misma regla que usan
 * `db-read-only.mjs` y el workflow de copia. Solo lee `information_schema`.
 * Un usuario sin SELECT global no ve la marca aunque exista: para él la
 * respuesta es `unknown`, nunca `old` (ver `classifyDatabaseIdentity`).
 *
 * Vive aparte del envoltorio para que sus pruebas, que corren en un proyecto
 * de mentira sin base, la sustituyan por un archivo que responde fijo.
 */
import { createRequire } from "node:module";

import { classifyDatabaseIdentity, DB_IDENTITY_GLOBAL_SELECT_SQL, DB_IDENTITY_MARKER_SQL } from "./prod-guard.mjs";

/**
 * Con un cliente ya abierto (el de `db-read-only.mjs`, por ejemplo).
 * @returns {Promise<"new" | "old" | "unknown">}
 */
export async function databaseIdentityOf(db) {
  const [marker] = await db.$queryRawUnsafe(DB_IDENTITY_MARKER_SQL);
  const [global] = await db.$queryRawUnsafe(DB_IDENTITY_GLOBAL_SELECT_SQL);
  return classifyDatabaseIdentity({ markerVisible: Number(marker.n) > 0, globalSelect: Number(global.n) > 0 });
}

/** @param {string} url @param {string} projectRoot @returns {Promise<"new" | "old" | "unknown">} */
export async function probeDatabaseIdentity(url, projectRoot) {
  const require = createRequire(`${projectRoot}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    return await databaseIdentityOf(db);
  } finally {
    await db.$disconnect();
  }
}
