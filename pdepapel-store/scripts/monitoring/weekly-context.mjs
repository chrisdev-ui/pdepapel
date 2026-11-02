#!/usr/bin/env node
/**
 * Everything the weekly review needs before opening a dashboard: date windows,
 * ready-made dashboard URLs, metric keys, where to write, and known events.
 *
 *   node pdepapel-store/scripts/monitoring/weekly-context.mjs [--date YYYY-MM-DD]
 *   node pdepapel-store/scripts/monitoring/weekly-context.mjs --set-targets --product /producto/x --category /categoria/y
 */
import path from "node:path";

import { bogotaDate, ensureDir, outputDir, readJson, weekWindows, writeJson } from "./lib/common.mjs";
import { deploysInWindow, knownEvents } from "./lib/context.mjs";
import { METRICS, SOURCES } from "./lib/metrics-schema.mjs";

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const out = outputDir();

if (args.includes("--set-targets")) {
  const product = value("--product");
  const category = value("--category");
  const valid = (p, prefix) => typeof p === "string" && p.startsWith(prefix) && /^[a-z0-9/_-]+$/i.test(p);
  if (!valid(product, "/producto/") || (category && !valid(category, "/categoria/"))) {
    console.error("--product debe ser /producto/<slug> y --category /categoria/<slug>");
    process.exit(2);
  }
  const previous = readJson(path.join(out, "targets.json"), {});
  const candidates = (value("--candidates") ?? "").split(",").filter((p) => valid(p, "/producto/"));
  writeJson(path.join(out, "targets.json"), {
    topProductPath: product,
    categoryPath: category ?? previous.categoryPath ?? null,
    productCandidates: candidates,
    updatedAt: new Date().toISOString(),
    source: "ga4 (revisión semanal)",
  });
  console.log("targets.json actualizado");
  process.exit(0);
}

const today = value("--date") ?? bogotaDate();
const windows = weekWindows(today);
const compact = (d) => d.replaceAll("-", "");
const ga4Range = (from, to) => `_u..nav%3Dmaui%26_u.date00%3D${compact(from)}%26_u.date01%3D${compact(to)}`;
const ga4 = (report, [from, to]) =>
  `https://analytics.google.com/analytics/web/?authuser=3#/a404772341p550061543/reports/explorer?params=${ga4Range(from, to)}&r=${report}`;

const rawDir = ensureDir(path.join(out, "raw", today));
const context = {
  today,
  windows,
  rawDir,
  reportPath: path.join(out, `${today}.md`),
  targets: readJson(path.join(out, "targets.json"), null),
  sources: SOURCES,
  metricKeys: METRICS.map(({ key, label, unit }) => `${key} — ${label} (${unit})`),
  urls: {
    ga4: {
      trafficCurrent: ga4("lifecycle-traffic-acquisition-v2", windows.current),
      trafficPrevious: ga4("lifecycle-traffic-acquisition-v2", windows.previous),
      eventsCurrent: ga4("top-events", windows.current),
      eventsPrevious: ga4("top-events", windows.previous),
      landingCurrent: ga4("all-pages-and-screens", windows.current),
      funnelCurrent: ga4("ecomm-shopping-funnel", windows.current),
      techCurrent: ga4("user-technology-detail", windows.current),
      overviewCurrent: ga4("reporting-hub", windows.current),
      dataFilters: "https://analytics.google.com/analytics/web/?authuser=3#/a404772341p550061543/admin/datafilters",
      note: "If a report id does not open, start from the overview link and use the left menu; keep the date range from the URL.",
    },
    clarity: {
      dashboard: "https://clarity.microsoft.com/projects/view/sc857ich8n/dashboard?date=Last%207%20days",
      recordings: "https://clarity.microsoft.com/projects/view/sc857ich8n/impressions?date=Last%207%20days",
      note: "Clarity's preset is the last 7 days ending today, not yesterday; the previous week comes from history.json.",
    },
    gsc: "https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Apapeleriapdepapel.com&num_of_days=7&compare_date=PREV_PERIOD",
    gscFallback: "https://search.google.com/search-console?resource_id=https%3A%2F%2Fpapeleriapdepapel.com%2F",
    merchant: "https://merchants.google.com/mc/products/diagnostics",
    tiktok: "https://ads.tiktok.com/i18n/events_manager/",
    admin: "https://admin.papeleriapdepapel.com/",
    pagespeed: "Run: node pdepapel-store/scripts/monitoring/psi-run.mjs --date <today> --paths / <top product> <category> /carrito",
  },
  knownEvents: knownEvents([windows.previous[0], windows.today]),
  deploys: deploysInWindow([windows.previous[0], windows.current[1]]),
  history: (readJson(path.join(out, "history.json"), { weeks: [] }).weeks ?? []).slice(-4).map((w) => ({ weekEnding: w.weekEnding, sources: w.sources })),
};

console.log(JSON.stringify(context, null, 2));
