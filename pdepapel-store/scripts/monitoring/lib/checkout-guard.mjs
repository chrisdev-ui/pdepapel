import { execFileSync } from "node:child_process";

import { STORE_DIR } from "./common.mjs";

/** What a monitoring run executes; a stale copy of any of these runs yesterday's rules. */
export const MONITORING_PATHS = [
  "pdepapel-store/scripts/monitoring",
  ".claude/commands/monitoreo-semanal.md",
  "pdepapel-admin/scripts/monitoring-sales-by-channel.ts",
];

export const STALE_TITLE = "Monitoreo: la copia principal está desactualizada (git pull)";

/**
 * `behind` counts origin/main commits missing here that touch MONITORING_PATHS;
 * `dirty` lists local changes to those paths. A failed fetch alone is not stale:
 * the comparison falls back to the last fetched origin/main and says so.
 */
export function assessCheckout({ behind, dirty, fetchError }) {
  const reasons = [];
  if (behind > 0) reasons.push(`le faltan ${behind} commit(s) de origin/main en archivos del monitoreo`);
  if (dirty.length) reasons.push(`archivos del monitoreo con cambios locales: ${dirty.join(", ")}`);
  return {
    stale: reasons.length > 0,
    reasons,
    note: fetchError ? `no se pudo consultar origin (${fetchError}); comparo con el último origin/main conocido` : null,
  };
}

function defaultGit(args) {
  return execFileSync("git", args, { cwd: STORE_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
}

export function inspectCheckout(git = defaultGit) {
  const top = git(["rev-parse", "--show-toplevel"]).trim();
  let fetchError = null;
  try {
    git(["-C", top, "fetch", "--quiet", "origin", "main"]);
  } catch (error) {
    fetchError = error?.code === "ETIMEDOUT" ? "tiempo agotado" : "error de git fetch";
  }
  const behind = Number.parseInt(git(["-C", top, "rev-list", "--count", "HEAD..origin/main", "--", ...MONITORING_PATHS]).trim(), 10) || 0;
  const dirty = git(["-C", top, "status", "--porcelain", "--", ...MONITORING_PATHS])
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  return assessCheckout({ behind, dirty, fetchError });
}
