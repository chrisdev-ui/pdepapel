import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  approvalProblem,
  buildApproval,
  classifyDatabaseIdentity,
  databaseIdentityProblem,
  describeDatabaseUrl,
  extractExpectArg,
  formatLogLine,
  isAllowedScriptPath,
  isBlockedLedgerOperation,
  isProductionDatabaseUrl,
  markApprovalUsed,
  prodWriteEnvFileFor,
  reasonNamesModel,
  runnerFor,
} from "../../../scripts/lib/prod-guard.mjs";

const NOW = Date.parse("2026-09-19T12:00:00.000Z");

/**
 * Dos veces en el lote 2B un guion borró filas del kardex en producción con
 * la URL root de `.env`. Estas reglas son la puerta que faltaba: sin
 * aprobación fresca, sin destino de producción o fuera de `scripts/`, nada corre.
 */
describe("approval token", () => {
  it("needs a real reason and expires in fifteen minutes", () => {
    expect(() => buildApproval({ reason: "borrar", now: NOW })).toThrow(/motivo/);
    const approval = buildApproval({ reason: "borrar el grupo de prueba 2b15bbdc y su kardex", operator: "christian", now: NOW });
    expect(approval.token).toHaveLength(48);
    expect(approval.expiresAt).toBe("2026-09-19T12:15:00.000Z");
    expect(approvalProblem(approval, NOW)).toBeNull();
  });

  it("refuses a missing, expired, used or malformed approval", () => {
    const approval = buildApproval({ reason: "borrar el grupo de prueba 2b15bbdc y su kardex", now: NOW });
    expect(approvalProblem(null, NOW)).toMatch(/prod:approve/);
    expect(approvalProblem(approval, NOW + 16 * 60 * 1000)).toMatch(/venció/);
    expect(approvalProblem(markApprovalUsed(approval, NOW), NOW + 1000)).toMatch(/ya se usó/);
    expect(approvalProblem({ ...approval, token: "corto" }, NOW)).toMatch(/token/);
    expect(approvalProblem({ ...approval, expiresAt: "nunca" }, NOW)).toMatch(/vencimiento/);
  });
});

describe("target and script checks", () => {
  it("only accepts the Railway production host and never echoes credentials", () => {
    expect(isProductionDatabaseUrl("mysql://root:secreto@monorail.proxy.rlwy.net:1234/railway")).toBe(true);
    expect(isProductionDatabaseUrl("mysql://root:secreto@127.0.0.1:3307/pdepapel_test")).toBe(false);
    expect(isProductionDatabaseUrl("mysql://root:secreto@evil.rlwy.net.example.com/railway")).toBe(false);
    expect(isProductionDatabaseUrl("no es una url")).toBe(false);
    expect(describeDatabaseUrl("mysql://root:secreto@monorail.proxy.rlwy.net:1234/railway")).toBe("root@monorail.proxy.rlwy.net/railway");
  });

  it("only runs scripts under scripts/ or the session scratchpad", () => {
    const projectRoot = "/repo/pdepapel-admin";
    const scratch = "/tmp/scratch";
    expect(isAllowedScriptPath("scripts/limpiar.mjs", { projectRoot })).toBe(true);
    expect(isAllowedScriptPath("/repo/pdepapel-admin/scripts/sub/limpiar.mjs", { projectRoot })).toBe(true);
    expect(isAllowedScriptPath("lib/prismadb.ts", { projectRoot })).toBe(false);
    expect(isAllowedScriptPath("scripts/../lib/x.mjs", { projectRoot })).toBe(false);
    expect(isAllowedScriptPath("/tmp/scratch/borrar.mjs", { projectRoot, extraRoots: [scratch] })).toBe(true);
    expect(isAllowedScriptPath("/tmp/otro/borrar.mjs", { projectRoot, extraRoots: [scratch] })).toBe(false);
    expect(isAllowedScriptPath("scripts/node_modules/x.mjs", { projectRoot })).toBe(false);
  });

  it("formats one log line per run without the connection string", () => {
    const line = formatLogLine({
      at: NOW,
      operator: "christian",
      reason: "borrar el grupo de prueba",
      scriptPath: "scripts/limpiar.mjs",
      scriptHash: "abcd1234abcd1234",
      target: "root@monorail.proxy.rlwy.net/railway",
      status: "ok",
      exitCode: 0,
      rowsAffected: 7,
    });
    expect(line).toBe('2026-09-19T12:00:00.000Z | christian | root@monorail.proxy.rlwy.net/railway | scripts/limpiar.mjs@abcd1234abcd1234 | estado=ok | exit=0 | rows=7 | "borrar el grupo de prueba"\n');
  });

  it("runs .ts with tsx (the project convention), .mjs/.js with node, and refuses anything else", () => {
    const projectRoot = "/repo/pdepapel-admin";
    expect(runnerFor("scripts/verify-schema.ts", { projectRoot, nodePath: "/bin/node" })).toMatchObject({ runner: "tsx", command: "/repo/pdepapel-admin/node_modules/.bin/tsx" });
    expect(runnerFor("scripts/limpiar.mjs", { projectRoot, nodePath: "/bin/node" })).toMatchObject({ runner: "node", command: "/bin/node" });
    expect(runnerFor("scripts/viejo.js", { projectRoot, nodePath: "/bin/node" })).toMatchObject({ runner: "node" });
    expect(runnerFor("scripts/algo.sql", { projectRoot })).toBeNull();
    expect(runnerFor("scripts/sin-extension", { projectRoot })).toBeNull();
  });
});

describe("ledger guard", () => {
  it("blocks deletes and updates on ledger models unless the reason names the model", () => {
    expect(isBlockedLedgerOperation({ model: "InventoryMovement", operation: "deleteMany", reason: "borrar productos de prueba" })).toBe(true);
    expect(isBlockedLedgerOperation({ model: "InventoryMovement", operation: "deleteMany", reason: "borrar productos de prueba y sus filas de kardex" })).toBe(false);
    expect(isBlockedLedgerOperation({ model: "Order", operation: "update", reason: "corregir el pedido ORD-1 (Order.total)" })).toBe(false);
    expect(isBlockedLedgerOperation({ model: "PaymentDetails", operation: "delete", reason: "limpiar productos" })).toBe(true);
    // Leer y crear no se bloquean; los modelos fuera del libro mayor tampoco.
    expect(isBlockedLedgerOperation({ model: "InventoryMovement", operation: "findMany", reason: "" })).toBe(false);
    expect(isBlockedLedgerOperation({ model: "InventoryMovement", operation: "create", reason: "" })).toBe(false);
    expect(isBlockedLedgerOperation({ model: "Product", operation: "deleteMany", reason: "" })).toBe(false);
    expect(reasonNamesModel("Borrar 3 movimientos de inventario", "InventoryMovement")).toBe(true);
  });
});

describe("prod-write wrapper", () => {
  const projectRoot = resolve(__dirname, "../../..");
  const wrapper = resolve(projectRoot, "scripts/prod-write.mjs");

  it("refuses to run an unapproved write and leaves no log line", () => {
    const logFile = resolve(projectRoot, "ops/prod-writes.log");
    const before = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
    // La aprobación se busca en un archivo que no existe, a propósito.
    //
    // Antes esta prueba leía la aprobación de verdad del proyecto: si había
    // una viva, el envoltorio la gastaba y corría el guion CONTRA PRODUCCIÓN.
    // Pasó el 2026-09-20 y se llevó dos aprobaciones recién pedidas. Una
    // prueba unitaria no puede tocar producción ni por accidente.
    const approvalFile = join(mkdtempSync(join(tmpdir(), "prod-guard-approval-")), "no-existe.json");
    const result = spawnSync(process.execPath, [wrapper, "scripts/verify-schema.ts"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, PROD_WRITE_EXTRA_ROOT: "", PROD_WRITE_APPROVAL_FILE: approvalFile },
    });
    expect(result.status).toBe(2);
    // Ahora la negativa es siempre la misma, no «cualquiera de estas».
    expect(result.stderr).toMatch(/^prod-write: .*(falta \.env\.prod-write|No hay aprobación)/);
    const after = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
    expect(after).toBe(before);
  });

  it("nunca gasta la aprobación real del proyecto", () => {
    // El fallo concreto que hay que impedir: que correr las pruebas marque
    // como usada la aprobación que la dueña acaba de pedir para otra cosa.
    const real = resolve(projectRoot, ".prod-write-approval.json");
    const beforeStamp = existsSync(real) ? readFileSync(real, "utf8") : null;
    const approvalFile = join(mkdtempSync(join(tmpdir(), "prod-guard-approval-")), "no-existe.json");
    spawnSync(process.execPath, [wrapper, "scripts/verify-schema.ts"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, PROD_WRITE_EXTRA_ROOT: "", PROD_WRITE_APPROVAL_FILE: approvalFile },
    });
    const afterStamp = existsSync(real) ? readFileSync(real, "utf8") : null;
    expect(afterStamp).toBe(beforeStamp);
  });

  it("refuses a script outside scripts/ even with a valid-looking approval file elsewhere", () => {
    const scratch = mkdtempSync(join(tmpdir(), "prod-guard-"));
    const rogue = join(scratch, "rogue.mjs");
    writeFileSync(rogue, "console.log('nunca')\n");
    expect(isAllowedScriptPath(rogue, { projectRoot })).toBe(false);
  });

  /**
   * Corridas completas del envoltorio en un proyecto de mentira: mismos
   * guiones, `.env.prod-write` con un host de Railway falso y una aprobación
   * fresca. Ningún guion abre conexión: sólo se comprueba qué se gasta y qué
   * queda escrito en el registro según cómo termine el hijo.
   */
  /**
   * `identity` es lo que responde la base de mentira a «¿qué base eres?»: el
   * proyecto falso lleva un `lib/db-identity.mjs` que contesta fijo, en vez
   * del real que abre una conexión. Si la URL viene de
   * `.env.prod-write.old-db`, la base de mentira es siempre la vieja.
   */
  const fakeProject = ({ linkNodeModules = true, identity = "new" as "new" | "old" | "unknown" } = {}) => {
    const root = mkdtempSync(join(tmpdir(), "prod-write-"));
    mkdirSync(join(root, "scripts", "lib"), { recursive: true });
    for (const file of ["prod-write.mjs", "lib/prod-guard.mjs"]) {
      writeFileSync(join(root, "scripts", file), readFileSync(resolve(projectRoot, "scripts", file)));
    }
    writeFileSync(
      join(root, "scripts", "lib", "db-identity.mjs"),
      `export async function probeDatabaseIdentity(url) { return url.includes("vieja") ? "old" : ${JSON.stringify(identity)}; }\n`,
    );
    writeFileSync(join(root, ".env.prod-write"), "DATABASE_URL=mysql://root:falso@prueba.proxy.rlwy.net:1/railway\n");
    writeFileSync(join(root, ".prod-write-approval.json"), JSON.stringify(buildApproval({ reason: "prueba del envoltorio en un directorio temporal", operator: "vitest" })));
    if (linkNodeModules) symlinkSync(resolve(projectRoot, "node_modules"), join(root, "node_modules"), "dir");
    const run = (script: string, args: string[] = ["--expect", "new"]) =>
      spawnSync(process.execPath, [join(root, "scripts", "prod-write.mjs"), script, ...args], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } });
    const approvalUsed = () => Boolean(JSON.parse(readFileSync(join(root, ".prod-write-approval.json"), "utf8")).usedAt);
    const log = () => (existsSync(join(root, "ops/prod-writes.log")) ? readFileSync(join(root, "ops/prod-writes.log"), "utf8") : "");
    return { root, run, approvalUsed, log };
  };

  it("refuses an extension it cannot run before spending the approval", () => {
    const project = fakeProject();
    writeFileSync(join(project.root, "scripts/algo.sql"), "SELECT 1;\n");
    const result = project.run("scripts/algo.sql");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no sé ejecutar scripts\/algo\.sql/);
    expect(project.approvalUsed()).toBe(false);
    expect(project.log()).toBe("");
  });

  it("runs a TypeScript script through tsx and logs estado=ok with the rows it reports", () => {
    const project = fakeProject();
    writeFileSync(join(project.root, "scripts/lee.ts"), 'const n: number = 3;\nconsole.log(`PROD_WRITE_ROWS=${n}`);\n');
    const result = project.run("scripts/lee.ts");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("(con tsx)");
    expect(project.approvalUsed()).toBe(true);
    expect(project.log()).toMatch(/ \| scripts\/lee\.ts@[0-9a-f]{16} \| estado=ok \| exit=0 \| rows=3 \| "prueba del envoltorio en un directorio temporal"\n$/);
  });

  it("records a script that started and failed as estado=error and still spends the approval", () => {
    const project = fakeProject();
    writeFileSync(join(project.root, "scripts/rompe.mjs"), "process.exit(1);\n");
    const result = project.run("scripts/rompe.mjs");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/estado «error»/);
    expect(project.approvalUsed()).toBe(true);
    expect(project.log()).toMatch(/ \| estado=error \| exit=1 \| rows=\? \| /);
  });

  it("keeps the approval when the child process never starts and records estado=sin-arrancar", () => {
    const project = fakeProject({ linkNodeModules: false });
    // Un «tsx» que existe pero no se puede ejecutar: spawn falla con EACCES.
    mkdirSync(join(project.root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(project.root, "node_modules/.bin/tsx"), "no ejecutable\n");
    chmodSync(join(project.root, "node_modules/.bin/tsx"), 0o644);
    writeFileSync(join(project.root, "scripts/lee.ts"), "console.log('nunca');\n");
    const result = project.run("scripts/lee.ts");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no arrancó .*la aprobación sigue válida/);
    expect(project.approvalUsed()).toBe(false);
    expect(project.log()).toMatch(/ \| estado=sin-arrancar \| exit=- \| rows=\? \| /);
  });

  /**
   * Después del corte a us-east4 hay dos bases de producción: la nueva (con
   * `migration_meta`) y la vieja, de respaldo. Una migración o un backfill no
   * pueden caer en la equivocada por una URL cambiada: el envoltorio exige
   * `--expect new|old`, pregunta a la base cuál es y se niega antes de gastar
   * la aprobación si no coincide.
   */
  describe("--expect new|old", () => {
    it("refuses without --expect and keeps the approval", () => {
      const project = fakeProject();
      writeFileSync(join(project.root, "scripts/escribe.mjs"), "console.log('nunca');\n");
      const result = project.run("scripts/escribe.mjs", []);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/falta --expect new\|old/);
      expect(result.stdout).not.toContain("nunca");
      expect(project.approvalUsed()).toBe(false);
      expect(project.log()).toBe("");
    });

    it("refuses when the database is not the expected one and keeps the approval", () => {
      const project = fakeProject({ identity: "old" });
      writeFileSync(join(project.root, "scripts/escribe.mjs"), "console.log('nunca');\n");
      const result = project.run("scripts/escribe.mjs", ["--expect", "new"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/la base de destino es la VIEJA .* no la NUEVA/);
      expect(result.stdout).not.toContain("nunca");
      expect(project.approvalUsed()).toBe(false);
      expect(project.log()).toBe("");
    });

    it("refuses when the user cannot tell which database it is (no global SELECT)", () => {
      const project = fakeProject({ identity: "unknown" });
      writeFileSync(join(project.root, "scripts/escribe.mjs"), "console.log('nunca');\n");
      const result = project.run("scripts/escribe.mjs", ["--expect", "old"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/no puede ver la marca/);
      expect(project.approvalUsed()).toBe(false);
      expect(project.log()).toBe("");
    });

    it("refuses an invalid --expect value", () => {
      const project = fakeProject();
      writeFileSync(join(project.root, "scripts/escribe.mjs"), "console.log('nunca');\n");
      const result = project.run("scripts/escribe.mjs", ["--expect", "nueva"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/--expect debe ser new u old/);
      expect(project.approvalUsed()).toBe(false);
    });

    it("runs on a match, passes the expectation in PROD_WRITE_EXPECT and not as an argument, and logs which database", () => {
      const project = fakeProject();
      writeFileSync(
        join(project.root, "scripts/escribe.mjs"),
        "console.log(`args=${JSON.stringify(process.argv.slice(2))} expect=${process.env.PROD_WRITE_EXPECT}`);\nconsole.log('PROD_WRITE_ROWS=0');\n",
      );
      // `--expect` puede ir antes o después del guion, como en prod:migrate.
      const result = spawnSync(
        process.execPath,
        [join(project.root, "scripts", "prod-write.mjs"), "--expect", "new", "scripts/escribe.mjs", "archivo.sql"],
        { cwd: project.root, encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('args=["archivo.sql"] expect=new');
      expect(result.stdout).toContain("[base nueva]");
      expect(project.approvalUsed()).toBe(true);
      expect(project.log()).toMatch(/\[base nueva\] \| scripts\/escribe\.mjs@/);
    });

    it("with --expect old uses .env.prod-write.old-db when it exists", () => {
      const project = fakeProject();
      writeFileSync(join(project.root, ".env.prod-write.old-db"), "DATABASE_URL=mysql://root:falso@vieja.proxy.rlwy.net:1/railway\n");
      writeFileSync(join(project.root, "scripts/escribe.mjs"), "console.log('PROD_WRITE_ROWS=0');\n");
      const result = project.run("scripts/escribe.mjs", ["--expect", "old"]);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("root@vieja.proxy.rlwy.net/railway [base vieja]");

      // Y la nueva sigue en `.env.prod-write`.
      const nueva = fakeProject();
      writeFileSync(join(nueva.root, ".env.prod-write.old-db"), "DATABASE_URL=mysql://root:falso@vieja.proxy.rlwy.net:1/railway\n");
      writeFileSync(join(nueva.root, "scripts/escribe.mjs"), "console.log('PROD_WRITE_ROWS=0');\n");
      const enNueva = nueva.run("scripts/escribe.mjs", ["--expect", "new"]);
      expect(enNueva.status).toBe(0);
      expect(enNueva.stdout).toContain("root@prueba.proxy.rlwy.net/railway [base nueva]");
    });
  });
});

describe("extractExpectArg / prodWriteEnvFileFor / databaseIdentityProblem", () => {
  it("takes --expect from anywhere, in both spellings, and leaves the rest untouched", () => {
    expect(extractExpectArg(["scripts/x.mjs", "--on", "--expect", "old"])).toEqual({ expect: "old", rest: ["scripts/x.mjs", "--on"], problem: null });
    expect(extractExpectArg(["--expect=new", "scripts/apply.mjs", "m.sql"])).toEqual({ expect: "new", rest: ["scripts/apply.mjs", "m.sql"], problem: null });
  });

  it("refuses a missing, invalid or contradictory --expect", () => {
    expect(extractExpectArg(["scripts/x.mjs"]).problem).toMatch(/falta --expect/);
    expect(extractExpectArg(["scripts/x.mjs", "--expect"]).problem).toMatch(/new u old/);
    expect(extractExpectArg(["--expect", "new", "--expect", "old"]).problem).toMatch(/valores distintos/);
    expect(extractExpectArg(["--expect", "new", "--expect=new"]).expect).toBe("new");
  });

  it("only --expect old with the old-db file present switches the env file", () => {
    expect(prodWriteEnvFileFor("old", true)).toBe(".env.prod-write.old-db");
    expect(prodWriteEnvFileFor("old", false)).toBe(".env.prod-write");
    expect(prodWriteEnvFileFor("new", true)).toBe(".env.prod-write");
  });

  it("explains a mismatch and accepts a match", () => {
    expect(databaseIdentityProblem("new", "new")).toBeNull();
    expect(databaseIdentityProblem("old", "new")).toMatch(/es la NUEVA .* no la VIEJA/);
  });

  /**
   * Comprobado el 2026-10-06 contra «MySQL US East»: `pdepapel_ro` (solo
   * `railway.*`) no ve `migration_meta` aunque exista, y la base nueva le
   * parecía la vieja. La ausencia de la marca solo cuenta para un usuario con
   * SELECT global; para los demás la identidad es «unknown» y no se escribe.
   */
  it("classifies by the marker only when the user could see it", () => {
    expect(classifyDatabaseIdentity({ markerVisible: true, globalSelect: true })).toBe("new");
    expect(classifyDatabaseIdentity({ markerVisible: true, globalSelect: false })).toBe("new");
    expect(classifyDatabaseIdentity({ markerVisible: false, globalSelect: true })).toBe("old");
    expect(classifyDatabaseIdentity({ markerVisible: false, globalSelect: false })).toBe("unknown");
    expect(databaseIdentityProblem("old", "unknown")).toMatch(/no puede ver la marca/);
    expect(databaseIdentityProblem("new", "unknown")).toMatch(/no puede ver la marca/);
  });
});
