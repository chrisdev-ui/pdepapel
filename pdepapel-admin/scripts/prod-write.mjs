/**
 * La única puerta para escribir en la base de producción desde un guion.
 *
 *   npm run prod:write -- scripts/mi-guion.mjs [argumentos]
 *   npm run prod:write -- /ruta/al/scratchpad/guion.mjs
 *
 * Qué exige, en orden: `.env.prod-write` con la URL de escritura (fuera de
 * `.env`, que sólo trae el usuario de lectura); una aprobación fresca y sin
 * usar de `prod-approve.mjs`; que el destino sea la base de producción de
 * Railway; y que el guion viva en `scripts/` o en el borrador de la sesión.
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

import {
  APPROVAL_FILE,
  approvalProblem,
  describeDatabaseUrl,
  formatLogLine,
  hashFile,
  isAllowedScriptPath,
  isProductionDatabaseUrl,
  markApprovalUsed,
  PROD_WRITE_ENV_FILE,
  PROD_WRITE_LOG,
  RUN_STATUS,
  runnerFor,
} from "./lib/prod-guard.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => {
  console.error(`prod-write: ${message}`);
  process.exit(2);
};

const [scriptPath, ...scriptArgs] = process.argv.slice(2);
if (!scriptPath) fail("indica el guion a ejecutar: npm run prod:write -- scripts/<guion>.mjs");

const envFile = resolve(projectRoot, PROD_WRITE_ENV_FILE);
if (!existsSync(envFile)) fail(`falta ${PROD_WRITE_ENV_FILE} (la URL de escritura vive ahí, nunca en .env).`);
const envText = readFileSync(envFile, "utf8");
const writeUrl = envText
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("DATABASE_URL="))
  .map((line) => line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, ""))
  .at(-1);
if (!writeUrl) fail(`${PROD_WRITE_ENV_FILE} no trae DATABASE_URL.`);
if (!isProductionDatabaseUrl(writeUrl)) fail(`el destino no es la base de producción de Railway (${describeDatabaseUrl(writeUrl)}).`);

const approvalFile = resolve(projectRoot, APPROVAL_FILE);
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

const extraRoots = [process.env.PROD_WRITE_EXTRA_ROOT, process.env.CLAUDE_SCRATCHPAD_DIR].filter(Boolean);
if (!isAllowedScriptPath(scriptPath, { projectRoot, extraRoots })) {
  fail(`el guion debe estar en scripts/ del proyecto o en el borrador de la sesión (PROD_WRITE_EXTRA_ROOT): ${scriptPath}`);
}
const absoluteScript = resolve(projectRoot, scriptPath);
if (!existsSync(absoluteScript)) fail(`no existe ${absoluteScript}`);
const runner = runnerFor(scriptPath, { projectRoot });
if (!runner) fail(`no sé ejecutar ${scriptPath}: usa .mjs/.js (Node) o .ts (tsx).`);
if (!existsSync(runner.command)) fail(`falta el ejecutor ${runner.runner} (${runner.command}); instala las dependencias.`);

const target = describeDatabaseUrl(writeUrl);
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
    target,
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
