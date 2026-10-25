import { PrismaClient } from "@prisma/client";

import { copilotRoStatements } from "../tests/integration/helpers/copilot-ro";
import { assertTestDatabaseEnv, TEST_DATABASE_NAME } from "./lib/test-database.mjs";

/**
 * Crea `copilot_ro` (sin contraseña) en la base local de pruebas con los mismos
 * archivos de concesiones que producción, para que las e2e del copiloto corran
 * con `COPILOT_DATABASE_URL=mysql://copilot_ro@127.0.0.1:3307/pdepapel_test`
 * (el valor por defecto de `with-e2e-env.mjs`). Se borra y se vuelve a crear en
 * cada siembra: la integración (`copilot-ro-grants.test.ts`) lo elimina al final.
 */
const url = new URL(assertTestDatabaseEnv(process.env, "seed-e2e-copilot-ro"));
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

async function main() {
  await prisma.$executeRawUnsafe("DROP USER IF EXISTS 'copilot_ro'@'%'");
  for (const statement of copilotRoStatements(TEST_DATABASE_NAME, "")) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`copilot_ro listo en ${url.hostname}:${url.port || "3306"}${url.pathname}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
