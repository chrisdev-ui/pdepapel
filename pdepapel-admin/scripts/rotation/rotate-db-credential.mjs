/**
 * Rota una credencial de MySQL de producción (incidente Railway 2026-10-21).
 * Lo corre Christian, siempre con aprobación fresca:
 *
 *   npm run prod:approve -- "<motivo>"
 *   npm run prod:write -- scripts/rotation/rotate-db-credential.mjs --expect new --account app|copilot|ro|root --phase rotate|discard
 *
 * - app     crea pdepapel_app (DML en el esquema + lectura de performance_schema) → Vercel DATABASE_URL (Production)
 * - copilot copilot_ro → Vercel COPILOT_DATABASE_URL (Production)
 * - ro      pdepapel_ro → Railway PDEPAPEL_RO_PASSWORD y PDEPAPEL_RO_PUBLIC_URL, GitHub BACKUP_DB_PASSWORD, .env local
 * - root    root (todas sus cuentas) → Railway MYSQL_ROOT_PASSWORD y MYSQL_PUBLIC_URL, .env.prod-write local
 *
 * `rotate` deja la contraseña vieja como secundaria; `discard` la anula, y se
 * corre solo después del deploy nuevo y la verificación. No imprime secretos.
 */
import { databaseIdentityOf } from "../lib/db-identity.mjs";
import { databaseOf, passwordOf, pipeSecret, readEnvValue, redact, replaceEnvValue } from "./lib.mjs";
import { discard, rotate } from "./rotate.mjs";

const fail = (message) => {
  console.error(`rotate-db-credential: ${message}`);
  process.exit(2);
};
if (process.env.PROD_WRITE_APPROVED !== "1") fail("solo corre con `npm run prod:write -- scripts/rotation/rotate-db-credential.mjs --expect new …`.");
if (process.env.PROD_WRITE_EXPECT !== "new") fail("solo para la base nueva (--expect new).");

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const accountKey = arg("account");
const phase = arg("phase");
if (!["app", "copilot", "ro", "root"].includes(accountKey)) fail("--account app|copilot|ro|root");
if (!["rotate", "discard"].includes(phase)) fail("--phase rotate|discard");

const RAILWAY = ["-p", "7b019502-da48-4234-98c4-b348862220b9", "-e", "cd420bfa-a0ad-450c-aeee-9ca43e6c711e", "-s", "735dd22e-860e-4b48-8e56-c11bb1930eba"];
const rootUrl = process.env.DATABASE_URL;
const rootPassword = passwordOf(rootUrl);
const cwd = process.cwd();

const vercel = (name, secrets) => (value) =>
  pipeSecret({ command: "vercel", args: ["env", "update", name, "production", "--sensitive", "-y"], value, secrets, cwd });
const railway = (name, secrets) => (value) =>
  pipeSecret({ command: "railway", args: ["variable", "set", name, "--stdin", "--skip-deploys", ...RAILWAY], value, secrets, cwd });
const github = (name, secrets) => (value) =>
  pipeSecret({ command: "gh", args: ["secret", "set", name, "-R", "chrisdev-ui/pdepapel"], value, secrets, cwd });
const localEnv = (file) => (value) => {
  try {
    replaceEnvValue(file, "DATABASE_URL", value);
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
};

function specFor(key) {
  const secrets = [rootPassword, rootUrl];
  if (key === "app") {
    return {
      user: "pdepapel_app",
      create: { schema: databaseOf(rootUrl) },
      urlBase: rootUrl,
      consumers: (_password, url) => [{ label: "Vercel DATABASE_URL (Production)", newValue: url, apply: vercel("DATABASE_URL", secrets) }],
      verify: async (url) => {
        const { PrismaClient } = await import("@prisma/client");
        const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
        try {
          await client.$queryRawUnsafe("SELECT COUNT(*) AS n FROM `Product`");
          await client.$queryRawUnsafe("SELECT COUNT(*) AS n FROM performance_schema.global_status");
          const forbidden = await client.$queryRawUnsafe("SELECT COUNT(*) AS n FROM mysql.user").then(() => true, () => false);
          return forbidden ? "pdepapel_app puede leer mysql.user" : null;
        } catch {
          return "pdepapel_app no puede leer el esquema o performance_schema";
        } finally {
          await client.$disconnect().catch(() => {});
        }
      },
      secrets,
    };
  }
  if (key === "copilot") {
    return {
      user: "copilot_ro",
      urlBase: rootUrl,
      consumers: (_password, url) => [{ label: "Vercel COPILOT_DATABASE_URL (Production)", newValue: url, apply: vercel("COPILOT_DATABASE_URL", secrets) }],
      secrets,
    };
  }
  if (key === "ro") {
    const roUrl = readEnvValue(".env", "DATABASE_URL");
    const roPassword = passwordOf(roUrl);
    const all = [...secrets, roUrl, roPassword];
    return {
      user: "pdepapel_ro",
      urlBase: roUrl,
      oldPassword: roPassword,
      currentUrl: roUrl,
      consumers: (password, url) => [
        { label: "Railway PDEPAPEL_RO_PASSWORD", newValue: password, oldValue: roPassword, apply: railway("PDEPAPEL_RO_PASSWORD", all) },
        { label: "Railway PDEPAPEL_RO_PUBLIC_URL", newValue: url, oldValue: roUrl, apply: railway("PDEPAPEL_RO_PUBLIC_URL", all) },
        { label: "GitHub BACKUP_DB_PASSWORD", newValue: password, oldValue: roPassword, apply: github("BACKUP_DB_PASSWORD", all) },
        { label: ".env local (DATABASE_URL)", newValue: url, oldValue: roUrl, apply: localEnv(".env") },
      ],
      secrets: all,
    };
  }
  return {
    user: "root",
    urlBase: rootUrl,
    oldPassword: rootPassword,
    currentUrl: rootUrl,
    consumers: (password, url) => [
      { label: "Railway MYSQL_ROOT_PASSWORD", newValue: password, oldValue: rootPassword, apply: railway("MYSQL_ROOT_PASSWORD", secrets) },
      { label: "Railway MYSQL_PUBLIC_URL", newValue: url, oldValue: rootUrl, apply: railway("MYSQL_PUBLIC_URL", secrets) },
      { label: ".env.prod-write local (DATABASE_URL)", newValue: url, oldValue: rootUrl, apply: localEnv(".env.prod-write") },
    ],
    secrets,
  };
}

const { createProdClient } = await import("../lib/prod-client.mjs");
const { PrismaClient } = await import("@prisma/client");
const db = createProdClient();
const log = (line) => console.log(`rotate-db-credential: ${line}`);

try {
  const identity = await databaseIdentityOf(db);
  if (identity !== "new") fail(`la base no es la nueva (marca: ${identity}). No se tocó nada.`);
  const spec = specFor(accountKey);
  // En discard, root y ro se comprueban con la URL ya actualizada en su archivo local.
  if (phase === "discard" && accountKey === "ro") spec.currentUrl = readEnvValue(".env", "DATABASE_URL");
  if (phase === "discard" && accountKey === "root") spec.currentUrl = readEnvValue(".env.prod-write", "DATABASE_URL");
  const deps = { db, PrismaClient, log, secrets: spec.secrets };
  const result = phase === "rotate" ? await rotate(spec, deps) : await discard(spec, deps);
  if (phase === "rotate" && accountKey === "app" && result.ok) {
    for (const row of await db.$queryRawUnsafe("SHOW GRANTS FOR 'pdepapel_app'@'%'")) log(String(Object.values(row)[0]));
  }
  log(result.ok ? "terminó bien." : `NO terminó: ${JSON.stringify({ ...result, hosts: undefined })}`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  log(`error: ${redact(String(error?.message ?? error), [rootPassword, rootUrl]).split("\n").map((l) => l.trim()).filter(Boolean).slice(-1)[0]?.slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
