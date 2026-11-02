const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const round = (value, digits = 0) => (typeof value === "number" ? Number(value.toFixed(digits)) : null);

function fieldMetric(metrics, key) {
  const metric = metrics?.[key];
  if (!metric) return null;
  const poor = metric.distributions?.[2]?.proportion;
  return { p75: metric.percentile ?? null, category: metric.category ?? null, poorPct: round(typeof poor === "number" ? poor * 100 : null, 1) };
}

/** Lab + CrUX field data for one URL. The key is optional: keyless calls share a small public quota. */
export async function runPsi(url, strategy, { key = process.env.PSI_API_KEY, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (key) params.set("key", key);
  try {
    const response = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(120_000) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || `HTTP ${response.status}`;
      return { url, strategy, ok: false, error: `PSI respondió ${response.status}: ${reason}` };
    }
    const audits = body?.lighthouseResult?.audits ?? {};
    const field = body?.loadingExperience?.metrics;
    const origin = body?.originLoadingExperience?.metrics;
    return {
      url,
      strategy,
      ok: true,
      lab: {
        score: round((body?.lighthouseResult?.categories?.performance?.score ?? NaN) * 100),
        lcpMs: round(audits["largest-contentful-paint"]?.numericValue),
        tbtMs: round(audits["total-blocking-time"]?.numericValue),
        cls: round(audits["cumulative-layout-shift"]?.numericValue, 3),
      },
      field: field
        ? {
            scope: body.loadingExperience.origin_fallback ? "origen" : "url",
            lcp: fieldMetric(field, "LARGEST_CONTENTFUL_PAINT_MS"),
            inp: fieldMetric(field, "INTERACTION_TO_NEXT_PAINT"),
            cls: fieldMetric(field, "CUMULATIVE_LAYOUT_SHIFT_SCORE"),
          }
        : null,
      originField: origin
        ? {
            lcp: fieldMetric(origin, "LARGEST_CONTENTFUL_PAINT_MS"),
            inp: fieldMetric(origin, "INTERACTION_TO_NEXT_PAINT"),
            cls: fieldMetric(origin, "CUMULATIVE_LAYOUT_SHIFT_SCORE"),
          }
        : null,
    };
  } catch (error) {
    return { url, strategy, ok: false, error: `PSI no respondió: ${error instanceof Error ? error.name : "error"}` };
  }
}
