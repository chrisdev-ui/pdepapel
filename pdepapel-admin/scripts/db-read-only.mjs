/**
 * Congela o descongela las escrituras de una base MySQL con
 * `SET GLOBAL super_read_only` (que arrastra `read_only`). Es el paso de
 * congelamiento del corte a us-east4 (docs/runbooks/db-region-migration.md).
 *
 *   node --env-file=.env scripts/db-read-only.mjs [--status] --expect old|new
 *       Solo lectura (vale pdepapel_ro): muestra @@read_only, @@super_read_only
 *       y qué base es. Es el modo por defecto.
 *   npm run prod:write -- scripts/db-read-only.mjs --on  --expect old
 *   npm run prod:write -- scripts/db-read-only.mjs --off --expect old
 *       Congela (06:01 del corte) o descongela (rollback) la base VIEJA, con
 *       aprobación fresca. prod-write anota la corrida en ops/prod-writes.log.
 *
 * `--expect` es obligatorio y se comprueba contra la base antes de tocar nada:
 * la nueva («MySQL US East») tiene la marca `migration_meta.target`; la vieja
 * no. Así un --on/--off nunca cae en la base equivocada por una URL cambiada.
 *
 * Sin el envoltorio de prod-write, --on/--off solo se aceptan con
 * `--expect new` y la marca presente: es la prueba contra la base nueva, que
 * todavía no usa nadie. Producción solo se toca a través de prod-write.
 *
 * Después de cambiar, intenta una escritura inocua (un UPDATE que no afecta
 * ninguna fila) y comprueba el resultado: con --on tiene que fallar con 1290;
 * con --off tiene que pasar.
 */
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const mode = args.includes("--on")
  ? "on"
  : args.includes("--off")
    ? "off"
    : "status";
const expectIndex = args.indexOf("--expect");
const expected = expectIndex >= 0 ? args[expectIndex + 1] : undefined;
const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";

const fail = (message) => {
  console.error(`db-read-only: ${message}`);
  process.exit(2);
};

if (args.includes("--on") && args.includes("--off"))
  fail("usa --on o --off, no los dos");
if (expected !== "old" && expected !== "new")
  fail("falta --expect old|new (qué base esperas tocar)");
if (!process.env.DATABASE_URL) fail("falta DATABASE_URL");
if (mode !== "status" && !viaProdWrite && expected !== "new") {
  fail(
    "--on/--off sobre la base vieja (producción) solo con `npm run prod:write`",
  );
}

const require = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = require("@prisma/client");
let db;
if (viaProdWrite) {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  db = new PrismaClient();
}

const state = async () => {
  const [row] = await db.$queryRawUnsafe(
    "SELECT @@read_only AS ro, @@super_read_only AS sro, CURRENT_USER() AS who",
  );
  return {
    readOnly: Number(row.ro),
    superReadOnly: Number(row.sro),
    user: String(row.who).split("@")[0],
  };
};

/** Escritura que no cambia nada: UPDATE sin filas. Con super_read_only da 1290. */
const probeWrite = async () => {
  try {
    await db.$executeRawUnsafe(
      "UPDATE `Store` SET `name` = `name` WHERE 1 = 0",
    );
    return { blocked: false };
  } catch (error) {
    const text = String(error?.message ?? error);
    return {
      blocked: /1290|read-only|super-read-only|read_only/i.test(text),
      error: text.split("\n").pop().slice(0, 160),
    };
  }
};

try {
  const [marker] = await db.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'migration_meta'",
  );
  const isNew = Number(marker.n) > 0;
  const actual = isNew ? "new" : "old";
  if (actual !== expected)
    fail(
      `la base es la ${actual === "new" ? "NUEVA" : "VIEJA"}, no la que esperabas (--expect ${expected}). No se tocó nada.`,
    );

  const before = await state();
  console.log(
    JSON.stringify({
      base:
        actual === "new"
          ? "nueva (MySQL US East)"
          : "vieja (producción us-west2)",
      usuario: before.user,
      read_only: before.readOnly,
      super_read_only: before.superReadOnly,
    }),
  );
  if (mode !== "status") {
    const sql =
      mode === "on"
        ? ["SET GLOBAL super_read_only = ON"]
        : ["SET GLOBAL super_read_only = OFF", "SET GLOBAL read_only = OFF"];
    for (const statement of sql) await db.$executeRawUnsafe(statement);

    const after = await state();
    const probe = await probeWrite();
    const ok =
      mode === "on"
        ? after.superReadOnly === 1 && probe.blocked
        : after.superReadOnly === 0 &&
          after.readOnly === 0 &&
          !probe.blocked &&
          !probe.error;
    console.log("PROD_WRITE_ROWS=0");
    console.log(
      JSON.stringify({
        modo: mode,
        read_only: after.readOnly,
        super_read_only: after.superReadOnly,
        escritura_de_prueba: probe.blocked
          ? `bloqueada (${probe.error})`
          : probe.error
            ? `error inesperado (${probe.error})`
            : "pasa",
        resultado: ok ? "OK" : "REVISAR",
      }),
    );
    if (!ok) process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
