/**
 * Applies a manual SQL migration through the Prisma connection.
 *
 * `prisma db execute` needs a Prisma config file since 6.19, and this repository
 * still declares its datasource the old way, so this runner uses the generated
 * client instead. It reads DATABASE_URL from the environment.
 *
 * Usage (from pdepapel-admin, Node 24):
 *   node --env-file=.env scripts/apply-manual-migration.mjs \
 *     prisma/manual-migrations/20260820_add_marketplace_order_item_acq_price.sql
 *
 * Statements run one at a time, in file order, and the script stops at the first
 * failure. It is NOT a transaction: MySQL commits DDL implicitly, so re-running a
 * partially applied file will fail on the statement that already succeeded. Read
 * the reported error before retrying.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

function getStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  const [filePath] = process.argv.slice(2);
  if (!filePath) {
    throw new Error(
      "Indica la ruta del archivo .sql que quieres aplicar como argumento",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "No hay DATABASE_URL en el entorno. Ejecuta con: node --env-file=.env scripts/apply-manual-migration.mjs <archivo.sql>",
    );
  }

  const absolutePath = resolve(process.cwd(), filePath);
  const statements = getStatements(readFileSync(absolutePath, "utf8"));
  if (statements.length === 0) {
    throw new Error(`El archivo ${filePath} no contiene sentencias SQL`);
  }

  console.log(`Aplicando ${statements.length} sentencia(s) de ${filePath}`);
  const prisma = new PrismaClient();
  try {
    for (const [index, statement] of statements.entries()) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 90);
      console.log(`  [${index + 1}/${statements.length}] ${preview}...`);
      const affected = await prisma.$executeRawUnsafe(statement);
      console.log(`      filas afectadas: ${affected}`);
    }
    console.log("Migración aplicada correctamente.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\nFalló la migración: ${error.message}`);
  process.exitCode = 1;
});
