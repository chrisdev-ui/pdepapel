import { METRIC_KEYS, SOURCES, sourceOfKey } from "./metrics-schema.mjs";

const COLLECTED_SOURCES = new Set(Object.keys(SOURCES).filter((key) => key !== "capa2"));
const isNum = (v) => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));

/** Hard errors reject the file; unknown metric keys are dropped with a warning so one typo doesn't lose a source. */
export function validateRawSource(source, raw) {
  const errors = [];
  const warnings = [];
  if (!COLLECTED_SOURCES.has(source)) errors.push(`fuente desconocida «${source}» (válidas: ${[...COLLECTED_SOURCES].join(", ")})`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["se esperaba un objeto"], warnings };
  if (raw.source !== source) errors.push(`"source" debe ser "${source}"`);
  if (typeof raw.ok !== "boolean") errors.push('"ok" debe ser true o false');
  if (raw.ok === false && !raw.error) errors.push('una fuente fallida necesita "error" con el motivo');
  const metrics = {};
  for (const [key, value] of Object.entries(raw.metrics ?? {})) {
    if (!METRIC_KEYS.has(key) || sourceOfKey(key) !== source) {
      warnings.push(`clave descartada ${key}`);
      continue;
    }
    if (!value || typeof value !== "object" || !isNum(value.current) || !isNum(value.previous)) {
      errors.push(`${key} debe ser {"current": número|null, "previous": número|null}`);
      continue;
    }
    metrics[key] = { current: value.current ?? null, previous: value.previous ?? null };
  }
  for (const table of raw.details ?? []) {
    if (!table?.title || !Array.isArray(table.columns) || !Array.isArray(table.rows)) errors.push("cada tabla de details necesita title, columns y rows");
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    value: { ...raw, metrics, details: raw.details ?? [], notes: raw.notes ?? [], partialErrors: raw.partialErrors ?? [] },
  };
}

const SUMMARY_KEYS = ["mejoro", "empeoro", "roto", "vigilar", "accion1"];
const IMPACTS = new Set(["alto", "medio", "bajo"]);

export function validateFindings(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return { ok: false, errors: ["se esperaba un objeto"], warnings: [] };
  for (const key of SUMMARY_KEYS) if (typeof doc.summary?.[key] !== "string") errors.push(`summary.${key} falta`);
  if (!Array.isArray(doc.findings)) errors.push("findings debe ser una lista");
  for (const [i, f] of (doc.findings ?? []).entries()) {
    if (!f?.title) errors.push(`findings[${i}].title falta`);
    if (!IMPACTS.has(f?.impact)) errors.push(`findings[${i}].impact debe ser alto, medio o bajo`);
  }
  return { ok: errors.length === 0, errors, warnings: [], value: doc };
}
