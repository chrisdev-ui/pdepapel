import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CUSTOMER_FACING, findSensitiveValues } from "./sensitive-patterns";

const ROOT = resolve(__dirname, "../../../..");
const SELF = new Set([
  "pdepapel-admin/tests/unit/security/sensitive-patterns.ts",
  "pdepapel-admin/tests/unit/security/no-sensitive-values.test.ts",
]);
const SKIP =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp4|webm|zip|xlsx|pen|svg)$/i;

function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((path) => path && !SKIP.test(path) && !SELF.has(path))
    .filter((path) => {
      try {
        return statSync(resolve(ROOT, path)).size < 5 * 1024 * 1024;
      } catch {
        return false;
      }
    });
}

describe("datos personales fuera del repositorio público", () => {
  it("detecta celulares, cuentas y direcciones que no están en la lista de permitidos", () => {
    const sample = [
      'phone: "3219876543"',
      'otro: "+57 321 987 6543"',
      'cuenta: "987-654321-09"',
      'address: "Carrera 98 # 76-54, apto 302"',
    ].join("\n");

    expect(findSensitiveValues(sample).map((hit) => hit.kind)).toEqual(["teléfono", "teléfono", "cuenta", "dirección"]);
  });

  it("ningún archivo versionado trae un celular, una cuenta o una dirección fuera de la lista", () => {
    const hits: string[] = [];
    for (const path of trackedTextFiles()) {
      const content = readFileSync(resolve(ROOT, path), "utf8");
      if (content.includes("\u0000")) continue;
      const allowed = CUSTOMER_FACING[path] ?? {};
      for (const hit of findSensitiveValues(content, { allowAccounts: allowed.accounts, allowPhones: allowed.phones })) {
        hits.push(`${path}:${hit.line} (${hit.kind})`);
      }
    }
    expect(hits).toEqual([]);
  }, 120_000);
});
