import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import globalSetup from "../../e2e/global-setup";
import {
  assertTestDatabaseEnv,
  assertTestDatabaseUrl,
  testDatabaseProblem,
  TestDatabaseGuardError,
} from "../../../scripts/lib/test-database.mjs";

const root = resolve(__dirname, "../../..");
const SECRET = "contrasena-que-no-debe-salir";
const PRODUCTION_URL = `mysql://root:${SECRET}@mainline.proxy.rlwy.net:41234/railway`;
const READ_ONLY_URL = `mysql://pdepapel_ro:${SECRET}@shuttle.proxy.rlwy.net:5555/railway`;
const TUNNELED_READ_ONLY_URL = `mysql://pdepapel_ro:${SECRET}@127.0.0.1:3307/pdepapel_test`;
const LOCAL_URL = `mysql://root:${SECRET}@127.0.0.1:3307/pdepapel_test`;

function envWithout(...names: string[]) {
  const env = { ...process.env };
  for (const name of names) delete env[name];
  return env;
}

describe("testDatabaseProblem", () => {
  it.each([
    ["el servidor de producción", PRODUCTION_URL, "apunta al servidor de producción"],
    ["el usuario de solo lectura de producción", READ_ONLY_URL, "apunta al servidor de producción"],
    ["el usuario de solo lectura aunque llegue por un túnel local", TUNNELED_READ_ONLY_URL, "usa el usuario de producción pdepapel_ro"],
    ["una URL ausente", undefined, "no está definida"],
    ["una URL vacía", "   ", "no está definida"],
    ["algo que no es URL", "pdepapel_test", "no es una URL válida"],
    ["otra base en el servidor local", "mysql://root:x@localhost:3306/railway", "no es pdepapel_test"],
    ["pdepapel_test en un servidor remoto", "mysql://root:x@db.ejemplo.com:3306/pdepapel_test", "no es local"],
  ])("rechaza %s", (_label, url, reason) => {
    expect(testDatabaseProblem(url)).toContain(reason);
  });

  it.each([
    LOCAL_URL,
    "mysql://root:root@localhost:3306/pdepapel_test",
    "mysql://root:root@[::1]:3306/pdepapel_test",
    "mysql://copilot_ro:x@127.0.0.1:3307/pdepapel_test",
  ])("acepta la base local %#", (url) => {
    expect(testDatabaseProblem(url)).toBeNull();
  });
});

describe("assertTestDatabaseEnv", () => {
  it("se detiene con un error que nombra la variable y no muestra la contraseña", () => {
    let error: unknown;
    try {
      assertTestDatabaseUrl(PRODUCTION_URL, { context: "prueba" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TestDatabaseGuardError);
    expect(String(error)).toContain("[prueba] DATABASE_URL apunta al servidor de producción");
    expect(String(error)).not.toContain(SECRET);
    expect(String(error)).not.toContain("rlwy");
  });

  it("exige DATABASE_URL", () => {
    expect(() => assertTestDatabaseEnv({}, "prueba")).toThrow("DATABASE_URL no está definida");
  });

  it("revisa COPILOT_DATABASE_URL cuando viene definida", () => {
    expect(() => assertTestDatabaseEnv({ DATABASE_URL: LOCAL_URL, COPILOT_DATABASE_URL: READ_ONLY_URL })).toThrow(
      "COPILOT_DATABASE_URL apunta al servidor de producción",
    );
    expect(assertTestDatabaseEnv({ DATABASE_URL: LOCAL_URL })).toBe(LOCAL_URL);
  });

  it("el arranque de Playwright se detiene sin la base local", () => {
    const saved = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      expect(() => globalSetup()).toThrow("[Playwright] DATABASE_URL no está definida");
      process.env.DATABASE_URL = READ_ONLY_URL;
      expect(() => globalSetup()).toThrow("[Playwright] DATABASE_URL apunta al servidor de producción");
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });

  it("las unitarias corren con la base local fijada por la configuración", () => {
    expect(testDatabaseProblem(process.env.DATABASE_URL)).toBeNull();
  });

  it("en CI, sin .env.test, la configuración toma TEST_DATABASE_URL del entorno", () => {
    const run = spawnSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "tests/unit/lib/env.test.ts"],
      { cwd: root, env: { ...envWithout("DATABASE_URL", "COPILOT_DATABASE_URL"), TEST_DATABASE_URL: "mysql://root:root@127.0.0.1:3306/pdepapel_test" }, encoding: "utf8" },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it("sin TEST_DATABASE_URL ni DATABASE_URL la integración no arranca", () => {
    const run = spawnSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.mts", "tests/integration/coupon-bulk-delete.test.ts"],
      { cwd: root, env: envWithout("DATABASE_URL", "COPILOT_DATABASE_URL", "TEST_DATABASE_URL"), encoding: "utf8" },
    );
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("TestDatabaseGuardError");
  }, 60_000);
});

describe("envoltorios", () => {
  it("with-test-env no arranca nada con una base de producción", () => {
    for (const url of [PRODUCTION_URL, READ_ONLY_URL, TUNNELED_READ_ONLY_URL]) {
      const run = spawnSync(process.execPath, ["scripts/with-test-env.mjs", process.execPath, "-e", "console.log('arrancó')"], {
        cwd: root,
        env: { ...process.env, TEST_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(run.status).not.toBe(0);
      expect(run.stdout).not.toContain("arrancó");
      expect(run.stderr).toContain("TestDatabaseGuardError");
      expect(run.stderr).not.toContain(SECRET);
    }
  });

  it("with-e2e-env no deja pasar las URL de base de `.env`", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/with-e2e-env.mjs", process.execPath, "-e", "console.log(JSON.stringify([process.env.DATABASE_URL ?? null, process.env.COPILOT_DATABASE_URL ?? null]))"],
      { cwd: root, env: envWithout("DATABASE_URL", "COPILOT_DATABASE_URL"), encoding: "utf8" },
    );
    expect(JSON.parse(output.trim().split("\n").at(-1)!)).toEqual([null, null]);
  });

  it("with-e2e-env respeta una base que se le pasa a propósito", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/with-e2e-env.mjs", process.execPath, "-e", "console.log(process.env.COPILOT_DATABASE_URL)"],
      { cwd: root, env: { ...envWithout("DATABASE_URL"), COPILOT_DATABASE_URL: LOCAL_URL }, encoding: "utf8" },
    );
    expect(output.trim().split("\n").at(-1)).toBe(LOCAL_URL);
  });
});

/**
 * La guarda solo sirve si nadie la rodea: cada cliente de Prisma en pruebas,
 * semillas y evaluaciones pasa por `test-database.mjs`, y cada comando que
 * corre Playwright o una semilla lleva `with-test-env`.
 */
describe("auditoría: nadie abre una base de pruebas por su cuenta", () => {
  const tracked = execFileSync("git", ["ls-files", "tests", "prisma/seed", "scripts"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx|mts|mjs|js)$/.test(file));
  const inScope = (file: string) =>
    file.startsWith("tests/e2e/") ||
    file.startsWith("tests/integration/") ||
    file.startsWith("prisma/seed/") ||
    file.startsWith("scripts/copilot-eval/") ||
    /^scripts\/seed-/.test(file);

  it("cada `new PrismaClient(` de pruebas y semillas usa la guarda compartida", () => {
    const offenders = tracked
      .filter(inScope)
      .filter((file) => {
        const source = readFileSync(resolve(root, file), "utf8");
        return /new PrismaClient\(/.test(source) && !/assertTestDatabase(Env|Url)/.test(source);
      });
    expect(offenders).toEqual([]);
  });

  it("no quedan guardas sueltas por archivo", () => {
    const offenders = tracked
      .filter((file) => file !== "scripts/lib/test-database.mjs" && !file.startsWith("tests/unit/"))
      .filter((file) => /endsWith\(\s*["']\/pdepapel_test["']\s*\)|!==\s*["']\/?pdepapel_test["']/.test(readFileSync(resolve(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("las e2e no abren Prisma sin el ayudante", () => {
    const offenders = tracked
      .filter((file) => file.startsWith("tests/e2e/") && file.endsWith(".spec.ts"))
      .filter((file) => /new PrismaClient\(/.test(readFileSync(resolve(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("los comandos de npm que tocan la base pasan por with-test-env", () => {
    const { scripts } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const offenders = Object.entries(scripts)
      .filter(([, command]) => /playwright test|prisma\/seed|seed-e2e|prisma db push|vitest\.integration|copilot-eval/.test(command))
      .filter(([, command]) => !command.includes("with-test-env"))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it("Vitest y Playwright arrancan con la guarda", () => {
    const read = (file: string) => readFileSync(resolve(root, file), "utf8");
    expect(read("vitest.config.mts")).toContain('setupFiles: ["./tests/setup-isolation.ts", "./tests/setup.ts"]');
    expect(read("vitest.integration.config.mts")).toContain('setupFiles: ["./tests/setup-isolation.ts", "./tests/integration/setup.ts"]');
    expect(read("scripts/copilot-eval/vitest.config.mts")).toContain('setupFiles: ["./tests/integration/setup.ts"]');
    expect(read("tests/setup.ts")).toContain("assertTestDatabaseEnv(");
    expect(read("tests/integration/setup.ts")).toContain("assertTestDatabaseEnv(");
    expect(read("playwright.config.ts")).toContain('globalSetup: "./tests/e2e/global-setup.ts"');
    expect(read("tests/e2e/global-setup.ts")).toContain("assertTestDatabaseEnv(");
  });
});
