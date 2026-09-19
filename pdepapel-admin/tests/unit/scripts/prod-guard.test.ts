import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  approvalProblem,
  buildApproval,
  describeDatabaseUrl,
  formatLogLine,
  isAllowedScriptPath,
  isBlockedLedgerOperation,
  isProductionDatabaseUrl,
  markApprovalUsed,
  reasonNamesModel,
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
      exitCode: 0,
      rowsAffected: 7,
    });
    expect(line).toBe('2026-09-19T12:00:00.000Z | christian | root@monorail.proxy.rlwy.net/railway | scripts/limpiar.mjs@abcd1234abcd1234 | exit=0 | rows=7 | "borrar el grupo de prueba"\n');
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
    const result = spawnSync(process.execPath, [wrapper, "scripts/verify-schema.ts"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, PROD_WRITE_EXTRA_ROOT: "" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/prod-write: (falta \.env\.prod-write|No hay aprobación|el destino no es)/);
    const after = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
    expect(after).toBe(before);
  });

  it("refuses a script outside scripts/ even with a valid-looking approval file elsewhere", () => {
    const scratch = mkdtempSync(join(tmpdir(), "prod-guard-"));
    const rogue = join(scratch, "rogue.mjs");
    writeFileSync(rogue, "console.log('nunca')\n");
    expect(isAllowedScriptPath(rogue, { projectRoot })).toBe(false);
  });
});
