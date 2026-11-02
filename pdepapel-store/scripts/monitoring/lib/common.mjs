import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MONITORING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STORE_DIR = path.resolve(MONITORING_DIR, "../..");
export const TIME_ZONE = "America/Bogota";

/** The main checkout, even when this runs from a worktree: reports must outlive worktrees. */
export function mainCheckoutRoot() {
  const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: STORE_DIR,
    encoding: "utf8",
  }).trim();
  return path.dirname(commonDir);
}

export function outputDir() {
  return process.env.MONITOREO_DIR || path.join(mainCheckoutRoot(), "output", "monitoreo");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Loads scripts/monitoring/.env (gitignored) without ever printing a value. */
export function loadLocalEnv() {
  const file = path.join(MONITORING_DIR, ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

export function bogotaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last 7 full days ending yesterday (Bogotá) and the 7 before them. */
export function weekWindows(today = bogotaDate()) {
  const currentEnd = addDays(today, -1);
  const currentStart = addDays(currentEnd, -6);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -6);
  return { today, current: [currentStart, currentEnd], previous: [previousStart, previousEnd] };
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Colombian mobiles (3xx xxx xxxx), with or without +57 and separators.
const PHONE = /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
// Long opaque tokens mix letters and digits and have no hyphens; product slugs have hyphens and stay readable.
const SECRET_LIKE =
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+|\bBearer\s+[A-Za-z0-9._-]{12,}|\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{40,}\b/g;

/** Last line of defence before anything lands in a report or a notification. */
export function scrubText(value) {
  if (typeof value !== "string") return value;
  return value.replace(EMAIL, "[correo oculto]").replace(PHONE, "[teléfono oculto]").replace(SECRET_LIKE, "[oculto]");
}

export function scrubDeep(value) {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubDeep(inner)]));
  }
  return value;
}
