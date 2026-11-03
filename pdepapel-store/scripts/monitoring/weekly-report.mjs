#!/usr/bin/env node
/**
 * Compiles the weekly report from what the review collected:
 *   raw/<date>/<source>.json   one per source: {source, ok, error, metrics:{key:{current,previous}}, details:[tables], notes:[]}
 *   raw/<date>/findings.json   {summary:{mejoro,empeoro,roto,vigilar,accion1}, findings:[...]}
 * Writes output/monitoreo/<date>.md and upserts history.json. Notifies only with --notify:
 * run-weekly.sh passes it after Claude exits, with the push token loaded only into that process.
 *
 *   node pdepapel-store/scripts/monitoring/weekly-report.mjs [--date YYYY-MM-DD] [--notify]
 */
import fs from "node:fs";
import path from "node:path";

import { median } from "./lib/baseline.mjs";
import { bogotaDate, outputDir, readJson, scrubDeep, scrubText, weekWindows, writeJson } from "./lib/common.mjs";
import { dailyResults, deploysInWindow, knownEvents } from "./lib/context.mjs";
import { SOURCES } from "./lib/metrics-schema.mjs";
import { notifyAll } from "./lib/notify.mjs";
import { collectMetrics, detailTables, historyEntry, metricsTable, rankFindings, upsertHistory } from "./lib/report.mjs";

const args = process.argv.slice(2);
const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : bogotaDate();
// The headless review compiles but never notifies, even if it passes --notify.
const NOTIFY = args.includes("--notify") && process.env.MONITOREO_HEADLESS !== "1";
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const num = (value) => (value !== undefined && value !== "-" && Number.isFinite(Number(value)) ? Number(value) : null);
// Filled by run-weekly.sh after the Claude run ends; a compile from inside the run has none yet.
const run = arg("--run-model")
  ? { model: arg("--run-model"), costUsd: num(arg("--run-cost")), minutes: num(arg("--run-minutes")), turns: num(arg("--run-turns")), exitCode: num(arg("--run-exit")) }
  : null;
const out = outputDir();
const rawDir = path.join(out, "raw", date);
const windows = weekWindows(date);

function capa2Summary() {
  // The daily check of the report day counts: on Tuesdays it runs right before the review.
  const current = dailyResults([windows.current[0], date]);
  const previous = dailyResults(windows.previous);
  const failedDays = (days) => days.filter((day) => !day.ok).length;
  const lcp = (days) => median(days.map((day) => day.vitals?.inicio_390?.lcpMs));
  const failureCounts = {};
  for (const day of current) for (const id of day.failures ?? []) failureCounts[id] = (failureCounts[id] ?? 0) + 1;
  for (const day of current) for (const r of day.regressions ?? []) {
    const id = `regresión ${r.id} ${r.metric}`;
    failureCounts[id] = (failureCounts[id] ?? 0) + 1;
  }
  return {
    source: "capa2",
    ok: current.length > 0,
    error: current.length ? null : "no hay resultados diarios en la semana",
    metrics: {
      "capa2.days_run": { current: current.length, previous: previous.length || null },
      "capa2.days_failed": { current: failedDays(current), previous: previous.length ? failedDays(previous) : null },
      "capa2.home_390_lcp_ms_median": { current: lcp(current), previous: lcp(previous) },
    },
    details: [
      {
        title: "Chequeo diario: fallas de la semana",
        columns: ["Chequeo", "Días con falla"],
        rows: Object.entries(failureCounts).length ? Object.entries(failureCounts).sort((a, b) => b[1] - a[1]) : [["(ninguna)", 0]],
      },
      {
        title: "Chequeo diario: días",
        columns: ["Fecha", "Resultado", "Inicio 390 LCP", "Producto 390 LCP", "Fallas"],
        rows: current.map((day) => [
          day.date,
          day.ok ? "OK" : "con fallas",
          day.vitals?.inicio_390?.lcpMs != null ? `${day.vitals.inicio_390.lcpMs} ms` : "—",
          day.vitals?.producto_390?.lcpMs != null ? `${day.vitals.producto_390.lcpMs} ms` : "—",
          (day.failures ?? []).join(", ") || "—",
        ]),
      },
    ],
  };
}

const rawFiles = fs.existsSync(rawDir)
  ? fs.readdirSync(rawDir).filter((name) => /^[a-z0-9]+\.json$/.test(name) && name !== "findings.json" && name !== "capa2.json")
  : [];
const rawSources = rawFiles.map((name) => scrubDeep(readJson(path.join(rawDir, name), { source: name.replace(/\.json$/, ""), ok: false, error: "JSON ilegible" })));
const bySource = Object.fromEntries(rawSources.map((raw) => [raw.source, raw]));
bySource.capa2 = capa2Summary();
writeJson(path.join(rawDir, "capa2.json"), bySource.capa2);

const sourceStatus = {};
for (const key of Object.keys(SOURCES)) {
  const raw = bySource[key];
  sourceStatus[key] = !raw ? "sin recolectar" : raw.ok ? (raw.partialErrors?.length ? "parcial" : "ok") : `falló: ${raw.error ?? "sin motivo"}`;
}

const { metrics, rejected } = collectMetrics(Object.values(bySource));
const historyFile = path.join(out, "history.json");
const history = readJson(historyFile, { schemaVersion: 1, weeks: [] });
const findingsDoc = scrubDeep(readJson(path.join(rawDir, "findings.json"), null));
const findings = rankFindings(findingsDoc?.findings);
const events = knownEvents([windows.previous[0], date]);
const deploys = deploysInWindow([windows.previous[0], windows.current[1]]);

const summary = findingsDoc?.summary ?? {};
const line = (label, text) => `- **${label}:** ${scrubText(text ?? "_sin dato: la revisión no escribió este punto_")}`;

const sections = [];
sections.push(`# Monitoreo semanal · ${date}`);
sections.push(
  `Semana actual **${windows.current[0]} → ${windows.current[1]}** frente a **${windows.previous[0]} → ${windows.previous[1]}** (hora de Bogotá).`,
);
const previousRun = (history.weeks ?? []).find((week) => week.weekEnding === date)?.run ?? null;
const shownRun = run ?? previousRun;
sections.push(
  shownRun
    ? `_Corrida: modelo ${shownRun.model} · costo ${shownRun.costUsd !== null ? `US$${shownRun.costUsd.toFixed(2)}` : "sin dato"} · ${shownRun.minutes ?? "?"} min · ${shownRun.turns ?? "?"} turnos${shownRun.exitCode ? ` · terminó con código ${shownRun.exitCode}` : ""}._`
    : "_Corrida: el costo se anota cuando termina la revisión (run-weekly.sh vuelve a compilar)._",
);
sections.push(
  [
    "## Resumen",
    line("Qué mejoró", summary.mejoro),
    line("Qué empeoró", summary.empeoro),
    line("Qué está roto", summary.roto),
    line("Qué vigilar", summary.vigilar),
    line("Acción #1", summary.accion1),
  ].join("\n"),
);

const eventLines = events.map((e) => `- ${e.start}${e.end && e.end !== e.start ? ` → ${e.end}` : e.end === null ? " → sigue" : ""}: ${e.label}`);
const deployLines = Array.isArray(deploys)
  ? (() => {
      const byDay = {};
      for (const d of deploys) byDay[d.date] = (byDay[d.date] ?? 0) + 1;
      const days = Object.entries(byDay).sort().map(([day, n]) => `${day} (${n})`).join(", ");
      const notable = deploys.filter((d) => /^(feat|fix|perf)/.test(d.subject)).slice(0, 12).map((d) => `  - \`${d.sha}\` ${d.date} ${d.subject}`);
      return [`- **${deploys.length} commits llegaron a main** en las dos semanas (cada push a main despliega ambas apps; no son despliegues uno a uno): ${days || "ninguno"}.`, ...notable];
    })()
  : [`- No se pudo leer el historial de despliegues: ${deploys.error}`];
sections.push(["## Qué distorsiona la comparación", ...eventLines, ...deployLines, ...(findingsDoc?.extraEvents ?? []).map((e) => `- ${e}`)].join("\n"));

sections.push(`## Números\n\n${metricsTable(metrics, history, date)}`);
if (rejected.length) {
  sections.push(`> Números descartados por no cumplir el formato (no se adivinan): ${rejected.map((r) => `\`${r.key}\` (${r.reason})`).join(", ")}.`);
}

const findingBlocks = findings.map((f, i) => {
  const parts = [`### ${i + 1}. ${f.title} · impacto ${f.impact ?? "sin estimar"}`];
  if (f.salesImpact) parts.push(`**Impacto estimado en ventas:** ${f.salesImpact}`);
  if (f.evidence) parts.push(`**Evidencia:** ${f.evidence}`);
  if (f.source) parts.push(`**Fuente:** ${SOURCES[f.source] ?? f.source}`);
  if (f.prompt) parts.push(`**Prompt para una sesión de implementación:**\n\n\`\`\`text\n${f.prompt.trim()}\n\`\`\``);
  if (f.paulaMessage) parts.push(`**Mensaje para Paula:**\n\n> ${f.paulaMessage.trim().replace(/\n/g, "\n> ")}`);
  return parts.join("\n\n");
});
sections.push(`## Hallazgos (ordenados por impacto en ventas)\n\n${findingBlocks.join("\n\n") || "_La revisión no registró hallazgos._"}`);

const failed = Object.entries(sourceStatus).filter(([, status]) => status !== "ok");
sections.push(
  [
    "## Fuentes",
    "| Fuente | Estado |",
    "|---|---|",
    ...Object.entries(sourceStatus).map(([key, status]) => `| ${SOURCES[key]} | ${status} |`),
    ...(failed.length ? ["", "Las fuentes que fallaron no tienen números en la tabla: no se estiman."] : []),
  ].join("\n"),
);

const detailSections = Object.entries(bySource)
  .map(([key, raw]) => {
    const tables = detailTables(raw.details);
    const notes = (raw.notes ?? []).map((n) => `- ${n}`).join("\n");
    const partial = (raw.partialErrors ?? []).map((n) => `- ⚠️ ${n}`).join("\n");
    const body = [notes, partial, tables].filter(Boolean).join("\n\n");
    return body ? `### ${SOURCES[key] ?? key}\n\n${body}` : null;
  })
  .filter(Boolean);
sections.push(`## Detalle por fuente\n\n${detailSections.join("\n\n") || "_Sin detalle._"}`);
sections.push(`---\n_Generado ${new Date().toISOString()} · datos crudos en \`output/monitoreo/raw/${date}/\` · historial en \`output/monitoreo/history.json\`._`);

const reportFile = path.join(out, `${date}.md`);
fs.writeFileSync(reportFile, `${sections.join("\n\n")}\n`);
writeJson(historyFile, upsertHistory(history, { ...historyEntry(date, metrics, sourceStatus), run: shownRun }));
console.log(`Informe: ${reportFile}`);
console.log(`Fuentes: ${Object.entries(sourceStatus).map(([k, s]) => `${k}=${s}`).join("; ")}`);

if (NOTIFY) {
  const top = findings.slice(0, 3).map((f, i) => `${i + 1}) ${f.title}`).join(" ");
  const sent = await notifyAll({
    title: "P de Papel · monitoreo semanal",
    body: `${top || "Sin hallazgos registrados."} Informe: output/monitoreo/${date}.md${failed.length ? ` · ${failed.length} fuente(s) sin datos` : ""}`,
    url: "https://admin.papeleriapdepapel.com",
    tag: `monitoreo-semanal-${date}`,
  });
  console.log("Avisos:", JSON.stringify(sent));
}
