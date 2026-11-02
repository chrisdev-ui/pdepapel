#!/usr/bin/env node
/**
 * Promotes a draft the weekly review wrote (raw/<date>/<source>.draft.json) to
 * raw/<date>/<source>.json after validating and scrubbing it. No JSON ever
 * travels inside a shell command: the review writes the draft with its file
 * tool, then runs this with only --date and --source.
 *
 *   node pdepapel-store/scripts/monitoring/save-raw.mjs --date YYYY-MM-DD --source ga4
 *   node pdepapel-store/scripts/monitoring/save-raw.mjs --date YYYY-MM-DD --source findings
 */
import fs from "node:fs";
import path from "node:path";

import { bogotaDate, outputDir, readJson, scrubDeep, writeJson } from "./lib/common.mjs";
import { validateFindings, validateRawSource } from "./lib/raw-validation.mjs";

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const date = value("--date") ?? bogotaDate();
const source = value("--source") ?? "";

if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9]+$/.test(source)) {
  console.error("Uso: save-raw.mjs --date YYYY-MM-DD --source <fuente|findings>");
  process.exit(2);
}
const dir = path.join(outputDir(), "raw", date);
const draft = path.join(dir, `${source}.draft.json`);
if (!fs.existsSync(draft)) {
  console.error(`No existe el borrador ${draft}`);
  process.exit(2);
}
const parsed = readJson(draft, undefined);
if (parsed === undefined) {
  console.error(`El borrador ${source}.draft.json no es JSON válido; corrígelo y vuelve a correr.`);
  process.exit(2);
}

const result = source === "findings" ? validateFindings(parsed) : validateRawSource(source, parsed);
if (!result.ok) {
  console.error(`Rechazado (el borrador queda para corregirlo): ${result.errors.join("; ")}`);
  process.exit(2);
}
writeJson(path.join(dir, `${source}.json`), scrubDeep({ ...result.value, savedAt: new Date().toISOString() }));
fs.renameSync(draft, path.join(dir, `.${source}.draft.saved`));
const count = Object.keys(result.value.metrics ?? {}).length;
console.log(`Guardado ${source}${source === "findings" ? "" : ` (${count} métricas)`}${result.warnings.length ? ` · avisos: ${result.warnings.join("; ")}` : ""}`);
