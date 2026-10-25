/**
 * Antes de `test:e2e:local`: la base de pruebas de la administración tiene que
 * contestar y tener la tienda sembrada. Si MySQL no responde, la levanta con el
 * `docker-compose.test.yml` de la administración y le aplica el esquema; luego
 * siembra siempre (la integración borra `e2e-admin-store`). Si algo falla se
 * detiene aquí, con el motivo, en vez de dejar specs fallando por «Can't reach
 * database server».
 */
import { spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

import { readTestDatabaseUrl, testDatabaseProblem } from "../../pdepapel-admin/scripts/lib/test-database.mjs";

const adminDir = fileURLToPath(new URL("../../pdepapel-admin", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function stop(message) {
  console.error(`\n[e2e local] ${message}\n`);
  process.exit(1);
}

const testDatabaseUrl = readTestDatabaseUrl(new URL("../../pdepapel-admin/.env.test", import.meta.url));
const problem = testDatabaseProblem(testDatabaseUrl);
if (problem) {
  stop(`TEST_DATABASE_URL de pdepapel-admin/.env.test ${problem}. Copia .env.test.example y apunta a la base local pdepapel_test.`);
}
const { hostname, port } = new URL(String(testDatabaseUrl).trim());

/** MySQL saluda primero; Docker acepta la conexión antes de que el servidor esté listo, así que se espera el saludo. */
function mysqlAnswers(timeoutMs = 3_000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname.replace(/^\[|\]$/g, ""), port: Number(port || 3306) });
    const done = (answered) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("data", () => done(true));
    socket.once("error", () => done(false));
    socket.once("close", () => done(false));
  });
}

function adminScript(name) {
  console.log(`[e2e local] npm --prefix pdepapel-admin run ${name}`);
  return spawnSync(npm, ["--prefix", adminDir, "run", name], { stdio: "inherit" }).status === 0;
}

if (!(await mysqlAnswers())) {
  console.log(`[e2e local] La base de pruebas (${hostname}:${port}) no contesta; se levanta con Docker.`);
  if (!adminScript("test:db:up")) {
    stop("No se pudo levantar la base de pruebas con Docker. Abre Docker Desktop y vuelve a correr `npm run test:e2e:local`.");
  }
  if (!(await mysqlAnswers(10_000))) {
    stop(`Docker arrancó, pero la base de pruebas no contesta en ${hostname}:${port}.`);
  }
  if (!adminScript("test:db:push")) {
    stop("No se pudo aplicar el esquema a la base de pruebas (`npm run test:db:push` en pdepapel-admin).");
  }
}

if (!adminScript("test:e2e:seed-admin")) {
  stop("No se pudo sembrar la tienda de pruebas (`npm run test:e2e:seed-admin` en pdepapel-admin). Revisa pdepapel-admin/.env.e2e.local.");
}
