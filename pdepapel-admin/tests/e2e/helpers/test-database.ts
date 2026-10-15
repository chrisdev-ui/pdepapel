import { PrismaClient } from "@prisma/client";

import { assertTestDatabaseEnv } from "../../../scripts/lib/test-database.mjs";

/** Única forma de abrir Prisma en una prueba e2e: la base local, con la URL explícita. */
export function createTestPrismaClient(context: string) {
  return new PrismaClient({ datasourceUrl: assertTestDatabaseEnv(process.env, `e2e: ${context}`) });
}
