#!/usr/bin/env node
/**
 * PageSpeed Insights for the weekly review, mobile + desktop, written straight
 * to raw/<date>/psi.json so no number passes through a model.
 *
 *   node pdepapel-store/scripts/monitoring/psi-run.mjs --date YYYY-MM-DD --paths / /producto/x /categoria/y /carrito
 *
 * Uses PSI_API_KEY from scripts/monitoring/.env when present; keyless otherwise
 * (small shared quota: a 429 is reported as a failed source, never retried in a loop).
 */
import path from "node:path";

import { bogotaDate, loadLocalEnv, outputDir, readJson, writeJson } from "./lib/common.mjs";
import { runPsi } from "./lib/psi.mjs";

loadLocalEnv(["PSI_API_KEY"]);
const args = process.argv.slice(2);
const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : bogotaDate();
const start = args.indexOf("--paths");
const paths = start >= 0 ? args.slice(start + 1).filter((p) => p.startsWith("/")) : ["/"];
const BASE_URL = process.env.MONITOREO_BASE_URL || "https://papeleriapdepapel.com";

const results = [];
for (const pagePath of paths) {
  for (const strategy of ["mobile", "desktop"]) {
    const result = await runPsi(`${BASE_URL}${pagePath}`, strategy);
    results.push({ path: pagePath, ...result });
    console.log(`${result.ok ? "ok " : "FALLA"} ${strategy} ${pagePath}${result.ok ? ` score ${result.lab.score} LCP ${result.lab.lcpMs} ms` : ` — ${result.error}`}`);
  }
}

const okResults = results.filter((r) => r.ok);
const find = (p, s) => okResults.find((r) => r.path === p && r.strategy === s);
const previous =
  (readJson(path.join(outputDir(), "history.json"), { weeks: [] }).weeks ?? []).filter((week) => week.weekEnding < date).at(-1)?.metrics ?? {};
const metric = (key, current) => ({ current: current ?? null, previous: previous[key] ?? null });
const home = find("/", "mobile");
const product = paths.find((p) => p.startsWith("/producto/"));
const productMobile = product ? find(product, "mobile") : null;
const origin = okResults.find((r) => r.originField)?.originField;

const raw = {
  source: "psi",
  ok: okResults.length > 0,
  collectedAt: new Date().toISOString(),
  error: okResults.length ? null : results[0]?.error ?? "sin resultados",
  partialErrors: results.filter((r) => !r.ok).map((r) => `${r.strategy} ${r.path}: ${r.error}`),
  metrics: {
    "psi.home_mobile_score": metric("psi.home_mobile_score", home?.lab.score),
    "psi.home_mobile_lcp_ms": metric("psi.home_mobile_lcp_ms", home?.lab.lcpMs),
    "psi.product_mobile_score": metric("psi.product_mobile_score", productMobile?.lab.score),
    "psi.product_mobile_lcp_ms": metric("psi.product_mobile_lcp_ms", productMobile?.lab.lcpMs),
    "psi.origin_lcp_p75_ms": metric("psi.origin_lcp_p75_ms", origin?.lcp?.p75),
    "psi.origin_inp_p75_ms": metric("psi.origin_inp_p75_ms", origin?.inp?.p75),
    "psi.origin_cls_p75": metric("psi.origin_cls_p75", typeof origin?.cls?.p75 === "number" ? origin.cls.p75 / 100 : null),
  },
  details: [
    {
      title: "PageSpeed Insights (laboratorio + campo CrUX)",
      columns: ["Página", "Dispositivo", "Puntaje", "LCP lab", "TBT", "CLS lab", "LCP campo p75", "INP campo p75", "CLS campo p75", "Campo"],
      rows: results.map((r) =>
        r.ok
          ? [
              r.path,
              r.strategy === "mobile" ? "móvil" : "escritorio",
              r.lab.score,
              `${r.lab.lcpMs} ms`,
              `${r.lab.tbtMs} ms`,
              r.lab.cls,
              r.field?.lcp?.p75 != null ? `${r.field.lcp.p75} ms` : "sin datos",
              r.field?.inp?.p75 != null ? `${r.field.inp.p75} ms` : "sin datos",
              r.field?.cls?.p75 != null ? (r.field.cls.p75 / 100).toFixed(2) : "sin datos",
              r.field?.scope ?? "sin datos CrUX",
            ]
          : [r.path, r.strategy, "falló", r.error, "", "", "", "", "", ""],
      ),
    },
  ],
};
writeJson(path.join(outputDir(), "raw", date, "psi.json"), raw);
console.log(`psi.json escrito (${okResults.length}/${results.length} corridas OK)`);
