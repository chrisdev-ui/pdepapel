/**
 * La única puerta para escribir en la base de producción desde un guion.
 *
 *   npm run prod:write -- scripts/mi-guion.mjs [argumentos]
 *   npm run prod:write -- /ruta/al/scratchpad/guion.mjs
 *
 *   npm run prod:write -- scripts/mi-guion.mjs --expect new [argumentos]
 *
 * Qué exige, en orden: `--expect new|old` (a qué base va: la nueva de
 * us-east4 o la vieja de us-west2); `.env.prod-write` con la URL de escritura
 * (fuera de `.env`, que sólo trae el usuario de lectura), o
 * `.env.prod-write.old-db` con `--expect old` si existe; una aprobación
 * fresca y sin usar de `prod-approve.mjs`; que el destino sea la base de
 * producción de Railway; que el guion viva en `scripts/` o en el borrador de
 * la sesión; y que la base real sea la esperada (marca `migration_meta`).
 * `--expect` no llega al guion como argumento: llega en `PROD_WRITE_EXPECT`.
 * Consume la aprobación en cuanto el proceso hijo arranca (un guion que falla
 * a medias ya pudo tocar la base: no se reutiliza); si el proceso ni siquiera
 * arranca, la aprobación sigue válida porque nada llegó a la base. Pasa
 * `DATABASE_URL` sólo al proceso hijo y anota la corrida en
 * `ops/prod-writes.log`, que se versiona, con su estado real.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { probeDatabaseIdentity } from "./lib/db-identity.mjs";
import {
  APPROVAL_FILE,
  approvalProblem,
  databaseIdentityProblem,
  describeDatabaseAlias,
  describeDatabaseUrl,
  extractExpectArg,
  formatLogLine,
  hashFile,
  isAllowedScriptPath,
  isProductionDatabaseUrl,
  markApprovalUsed,
  PROD_WRITE_LOG,
  PROD_WRITE_OLD_DB_ENV_FILE,
  prodWriteEnvFileFor,
  RUN_STATUS,
  runnerFor,
} from "./lib/prod-guard.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => {
  console.error(`prod-write: ${message}`);
  process.exit(2);
};

const { expect, rest: wrapperArgs, problem: expectProblem } = extractExpectArg(process.argv.slice(2));
const [scriptPath, ...scriptArgs] = wrapperArgs;
if (!scriptPath) fail("indica el guion a ejecutar: npm run prod:write -- scripts/<guion>.mjs --expect new|old");

const envFileName = prodWriteEnvFileFor(expect, existsSync(resolve(projectRoot, PROD_WRITE_OLD_DB_ENV_FILE)));
const envFile = resolve(projectRoot, envFileName);
if (!existsSync(envFile)) fail(`falta ${envFileName} (la URL de escritura vive ahí, nunca en .env).`);
const envText = readFileSync(envFile, "utf8");
const writeUrl = envText
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("DATABASE_URL="))
  .map((line) => line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, ""))
  .at(-1);
if (!writeUrl) fail(`${envFileName} no trae DATABASE_URL.`);
if (!isProductionDatabaseUrl(writeUrl)) fail(`el destino no es la base de producción de Railway (${describeDatabaseUrl(writeUrl)}).`);

// `PROD_WRITE_APPROVAL_FILE` existe para las pruebas, igual que
// `PROD_WRITE_EXTRA_ROOT`: la prueba del envoltorio lo apunta a un archivo que
// no existe para comprobar que se niega. Sin eso, correr `npm run test:unit`
// con una aprobación viva en el disco la gastaba y ejecutaba el guion contra
// producción; pasó de verdad y se llevó por delante dos aprobaciones.
//
// No debilita nada: quien puede poner variables de entorno también puede
// escribir el archivo de aprobación, que no está firmado.
const approvalFile = resolve(projectRoot, process.env.PROD_WRITE_APPROVAL_FILE || APPROVAL_FILE);
let approval = null;
if (existsSync(approvalFile)) {
  try {
    approval = JSON.parse(readFileSync(approvalFile, "utf8"));
  } catch {
    approval = null;
  }
}
const problem = approvalProblem(approval);
if (problem) fail(problem);
// Después de la aprobación, para que la negativa de siempre («No hay
// aprobación») siga siendo la primera; y antes de ejecutar nada.
if (expectProblem) fail(expectProblem);

const extraRoots = [process.env.PROD_WRITE_EXTRA_ROOT, process.env.CLAUDE_SCRATCHPAD_DIR].filter(Boolean);
if (!isAllowedScriptPath(scriptPath, { projectRoot, extraRoots })) {
  fail(`el guion debe estar en scripts/ del proyecto o en el borrador de la sesión (PROD_WRITE_EXTRA_ROOT): ${scriptPath}`);
}
const absoluteScript = resolve(projectRoot, scriptPath);
if (!existsSync(absoluteScript)) fail(`no existe ${absoluteScript}`);
const runner = runnerFor(scriptPath, { projectRoot });
if (!runner) fail(`no sé ejecutar ${scriptPath}: usa .mjs/.js (Node) o .ts (tsx).`);
if (!existsSync(runner.command)) fail(`falta el ejecutor ${runner.runner} (${runner.command}); instala las dependencias.`);

// Antes de arrancar el guion: ¿es la base que se dijo? Una migración o un
// backfill nunca pueden caer en la base equivocada por una URL cambiada. Si
// falla aquí, nada llegó a la base y la aprobación sigue válida.
let identity;
try {
  identity = await probeDatabaseIdentity(writeUrl, projectRoot);
} catch (error) {
  fail(`no se pudo comprobar qué base es (${String(error?.message ?? error).split("\n").pop()}); no se ejecutó nada.`);
}
const identityProblem = databaseIdentityProblem(expect, identity);
if (identityProblem) fail(identityProblem);

const target = `${describeDatabaseUrl(writeUrl)} [base ${identity === "new" ? "nueva" : "vieja"}]`;
const loggedTarget = describeDatabaseAlias(identity);
const scriptHash = hashFile(absoluteScript);
console.log(`prod-write: ${scriptPath}@${scriptHash} → ${target} (con ${runner.runner})`);
console.log(`prod-write: motivo «${approval.reason}» (aprobado por ${approval.operator ?? "?"}, vence ${approval.expiresAt})`);

const result = spawnSync(runner.command, [...runner.args, absoluteScript, ...scriptArgs], {
  cwd: projectRoot,
  env: {
    ...process.env,
    DATABASE_URL: writeUrl,
    PROD_WRITE_REASON: approval.reason,
    PROD_WRITE_APPROVED: "1",
    PROD_WRITE_EXPECT: expect,
  },
  stdio: ["inherit", "pipe", "inherit"],
  encoding: "utf8",
});

const started = !result.error;
if (started) {
  // Arrancó: pudo tocar la base, termine como termine. Se gasta la aprobación
  // para que un guion a medias no pueda repetirse con el mismo permiso.
  writeFileSync(approvalFile, `${JSON.stringify(markApprovalUsed(approval), null, 2)}\n`, { mode: 0o600 });
} else {
  console.error(`prod-write: el proceso no arrancó (${result.error.message}); la aprobación sigue válida.`);
}

process.stdout.write(result.stdout ?? "");
const rowsMatch = /PROD_WRITE_ROWS=(\d+)/.exec(result.stdout ?? "");
const status = !started ? RUN_STATUS.notStarted : result.status === 0 ? RUN_STATUS.ok : RUN_STATUS.error;
const logFile = resolve(projectRoot, PROD_WRITE_LOG);
mkdirSync(dirname(logFile), { recursive: true });
appendFileSync(
  logFile,
  formatLogLine({
    at: Date.now(),
    operator: approval.operator ?? userInfo().username,
    reason: approval.reason,
    scriptPath,
    scriptHash,
    target: loggedTarget,
    status,
    exitCode: started ? (result.status ?? "signal") : "-",
    rowsAffected: rowsMatch ? Number(rowsMatch[1]) : null,
  }),
);
if (status === RUN_STATUS.ok) {
  console.log(`prod-write: terminó bien; anotado en ${PROD_WRITE_LOG} (recuerda incluirlo en el commit).`);
} else {
  console.error(`prod-write: terminó con estado «${status}»; anotado así en ${PROD_WRITE_LOG}.`);
}
process.exit(started ? (result.status ?? 1) : 2);
