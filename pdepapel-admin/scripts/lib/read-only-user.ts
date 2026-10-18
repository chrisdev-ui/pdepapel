import type { PrismaClient } from "@prisma/client";

/** Ensayos y auditorías de producción: solo con `pdepapel_ro` (o la base local de pruebas), nunca con un usuario que escriba. */
export async function assertReadOnlyUser(db: Pick<PrismaClient, "$queryRawUnsafe">, databaseUrl = process.env.DATABASE_URL ?? "") {
  if (/\/pdepapel_test(\?|$)/.test(databaseUrl)) return;
  const [row] = await db.$queryRawUnsafe<{ who: string }[]>("SELECT CURRENT_USER() AS who");
  if (!String(row?.who ?? "").startsWith("pdepapel_ro@")) {
    throw new Error("Este guion de lectura solo corre con el usuario pdepapel_ro: revisa DATABASE_URL en el .env que le pasas.");
  }
}
