import { METRIC_KEYS, METRICS, SOURCES, sourceOfKey } from "./metrics-schema.mjs";

const SPARK = "▁▂▃▄▅▆▇█";

export function pctChange(current, previous) {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sparkline(values) {
  const nums = values.filter((v) => typeof v === "number");
  if (nums.length < 2) return "—";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return values
    .map((v) => {
      if (typeof v !== "number") return "·";
      if (max === min) return SPARK[3];
      return SPARK[Math.round(((v - min) / (max - min)) * (SPARK.length - 1))];
    })
    .join("");
}

/** ▲/▼ for direction, plus ✅/⚠️ when the metric has a good direction and moved more than 5 %. */
export function trendArrow(change, better) {
  if (change === null || change === undefined) return "—";
  if (Math.abs(change) < 1) return "＝";
  const arrow = change > 0 ? "▲" : "▼";
  if (!better || Math.abs(change) < 5) return arrow;
  const good = (change > 0 && better === "up") || (change < 0 && better === "down");
  return `${arrow}${good ? " ✅" : " ⚠️"}`;
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export function formatValue(value, unit) {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number") return String(value);
  switch (unit) {
    case "%":
      return `${nf.format(value)} %`;
    case "cop":
      return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;
    case "ms":
      return value >= 1000 ? `${nf.format(value / 1000)} s` : `${Math.round(value)} ms`;
    case "cls":
      return value.toFixed(3);
    case "pos":
      return nf.format(value);
    default:
      return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
  }
}

/**
 * Splits the raw source files into accepted metrics and problems. Raw metric
 * values are `{current, previous}`; anything else (a guess, a string, an
 * unknown key) is rejected and listed, never silently kept.
 */
export function collectMetrics(rawSources) {
  const metrics = {};
  const rejected = [];
  for (const raw of rawSources) {
    if (!raw?.ok) continue;
    for (const [key, value] of Object.entries(raw.metrics ?? {})) {
      if (!METRIC_KEYS.has(key)) {
        rejected.push({ key, reason: "clave desconocida" });
        continue;
      }
      if (sourceOfKey(key) !== raw.source) {
        rejected.push({ key, reason: `viene de ${raw.source}` });
        continue;
      }
      const current = value?.current;
      const previous = value?.previous;
      const okNumber = (v) => v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));
      if (!okNumber(current) || !okNumber(previous)) {
        rejected.push({ key, reason: "valor no numérico" });
        continue;
      }
      metrics[key] = { current: current ?? null, previous: previous ?? null };
    }
  }
  return { metrics, rejected };
}

/** history.json entries, oldest first; returns the same list with this week replaced or appended. */
export function upsertHistory(history, entry) {
  const weeks = (history?.weeks ?? []).filter((week) => week.weekEnding !== entry.weekEnding);
  weeks.push(entry);
  weeks.sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
  return { schemaVersion: 1, weeks };
}

export function historyEntry(weekEnding, metrics, sourceStatus, generatedAt = new Date().toISOString()) {
  return {
    weekEnding,
    generatedAt,
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value.current])),
    sources: sourceStatus,
  };
}

/** The last 4 weekly values (oldest → newest), the current week last. */
export function seriesFor(key, history, weekEnding, current) {
  const past = (history?.weeks ?? []).filter((week) => week.weekEnding < weekEnding).slice(-3);
  return [...past.map((week) => week.metrics?.[key] ?? null), current ?? null];
}

export function metricsTable(metrics, history, weekEnding) {
  const lines = [];
  let lastSource = null;
  for (const def of METRICS) {
    const value = metrics[def.key];
    if (!value) continue;
    const source = sourceOfKey(def.key);
    if (source !== lastSource) {
      lines.push(`| **${SOURCES[source] ?? source}** | | | | |`);
      lastSource = source;
    }
    const change = pctChange(value.current, value.previous);
    const series = seriesFor(def.key, history, weekEnding, value.current);
    lines.push(
      `| ${def.label} | ${formatValue(value.current, def.unit)} | ${formatValue(value.previous, def.unit)} | ${change === null ? "—" : `${change > 0 ? "+" : ""}${nf.format(change)} %`} ${trendArrow(change, def.better)} | ${sparkline(series)} |`,
    );
  }
  if (!lines.length) return "_Ninguna fuente entregó números esta semana._";
  return ["| Métrica | Esta semana | Semana anterior | Cambio | 4 semanas |", "|---|---:|---:|---:|:---:|", ...lines].join("\n");
}

export function detailTables(details) {
  return (details ?? [])
    .filter((table) => Array.isArray(table?.columns) && Array.isArray(table?.rows))
    .map((table) => {
      const head = `| ${table.columns.join(" | ")} |\n|${table.columns.map(() => "---").join("|")}|`;
      const rows = table.rows.slice(0, 15).map((row) => `| ${row.map((cell) => String(cell ?? "—").replace(/\|/g, "/")).join(" | ")} |`);
      return `**${table.title}**\n\n${head}\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

const IMPACT_ORDER = { alto: 0, medio: 1, bajo: 2 };

export function rankFindings(findings) {
  return [...(findings ?? [])].sort((a, b) => (IMPACT_ORDER[a.impact] ?? 3) - (IMPACT_ORDER[b.impact] ?? 3));
}
