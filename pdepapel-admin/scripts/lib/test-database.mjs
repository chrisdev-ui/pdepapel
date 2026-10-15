/**
 * La única puerta entre las pruebas y una base de datos.
 *
 * Vitest (unitarias, integración y evaluaciones del copiloto), el arranque de
 * Playwright, cada prueba e2e que abre un PrismaClient y los guiones de
 * semilla pasan por aquí. Solo se acepta la base local `pdepapel_test`; todo
 * lo demás detiene la ejecución con un error, nunca con un salto silencioso.
 *
 * El 2026-10-15 una prueba e2e abrió `new PrismaClient()` sin URL: Prisma leyó
 * `.env`, que apunta a producción, y solo el usuario de solo lectura evitó la
 * escritura. Por eso no basta con «no definir» la variable: hay que exigir la
 * correcta y pasarla explícita al cliente.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { PRODUCTION_DB_HOST_PATTERN } from "./prod-guard.mjs";

export const TEST_DATABASE_NAME = "pdepapel_test";
export const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** Usuarios que solo existen en producción, aunque un túnel los muestre en 127.0.0.1. */
export const PRODUCTION_DATABASE_USERS = new Set(["pdepapel_ro"]);

const HOW_TO_RUN =
  "Usa los comandos de npm (`npm run test:unit`, `npm run test:integration`, `npm run test:e2e`…) " +
  "o antepone `node scripts/with-test-env.mjs`; TEST_DATABASE_URL sale de .env.test (copia .env.test.example).";

export class TestDatabaseGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "TestDatabaseGuardError";
  }
}

/**
 * Por qué una URL no es la base local de pruebas; `null` si lo es. Nunca
 * devuelve la URL ni la contraseña: el motivo se imprime tal cual.
 * @param {string | undefined | null} url
 * @returns {string | null}
 */
export function testDatabaseProblem(url) {
  if (url === undefined || url === null || String(url).trim() === "") return "no está definida";
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return "no es una URL válida";
  }
  if (PRODUCTION_DB_HOST_PATTERN.test(parsed.hostname)) return "apunta al servidor de producción";
  if (PRODUCTION_DATABASE_USERS.has(decodeURIComponent(parsed.username))) {
    return `usa el usuario de producción ${decodeURIComponent(parsed.username)}`;
  }
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) return `el servidor ${parsed.hostname} no es local`;
  const database = parsed.pathname.replace(/^\//, "");
  if (database !== TEST_DATABASE_NAME) return `la base «${database || "(vacía)"}» no es ${TEST_DATABASE_NAME}`;
  return null;
}

/**
 * @param {string | undefined | null} url
 * @param {{ variable?: string, context?: string }} [options]
 * @returns {string} la URL, ya validada
 */
export function assertTestDatabaseUrl(url, { variable = "DATABASE_URL", context = "pruebas" } = {}) {
  const problem = testDatabaseProblem(url);
  if (problem) {
    throw new TestDatabaseGuardError(
      `[${context}] ${variable} ${problem}. Las pruebas solo pueden usar la base local ${TEST_DATABASE_NAME} ` +
        `(127.0.0.1 o localhost). ${HOW_TO_RUN}`,
    );
  }
  return String(url).trim();
}

/**
 * DATABASE_URL siempre; COPILOT_DATABASE_URL solo si viene definida (el
 * copiloto es opcional), pero entonces también tiene que ser la local.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [context]
 * @returns {string} DATABASE_URL validada
 */
export function assertTestDatabaseEnv(env = process.env, context = "pruebas") {
  const databaseUrl = assertTestDatabaseUrl(env.DATABASE_URL, { variable: "DATABASE_URL", context });
  if (env.COPILOT_DATABASE_URL?.trim()) {
    assertTestDatabaseUrl(env.COPILOT_DATABASE_URL, { variable: "COPILOT_DATABASE_URL", context });
  }
  return databaseUrl;
}

/**
 * TEST_DATABASE_URL del entorno o, si falta, de `.env.test`, sin cargar el
 * resto del archivo en el proceso. No lanza: quien la use la pasa por
 * `assertTestDatabaseUrl`.
 * @param {URL | string} environmentFile
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | undefined}
 */
export function readTestDatabaseUrl(environmentFile, env = process.env) {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!existsSync(environmentFile)) return undefined;
  return parseEnv(readFileSync(environmentFile, "utf8")).TEST_DATABASE_URL;
}
