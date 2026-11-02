export const BASELINE_DAYS = 7;
export const MIN_SAMPLES = 3;

export function median(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A metric regresses when it is worse than the rolling median by both a
 * relative and an absolute margin and also crosses the "needs improvement"
 * line, so lab noise on a good day never pages anyone.
 */
const RULES = {
  lcpMs: { ratio: 1.3, absolute: 500, floor: 2500 },
  cls: { ratio: 1.5, absolute: 0.05, floor: 0.1 },
};

export function isRegression(metric, value, baseline) {
  const rule = RULES[metric];
  if (!rule || typeof value !== "number" || typeof baseline !== "number") return false;
  return value > baseline * rule.ratio && value - baseline > rule.absolute && value > rule.floor;
}

/** `history` is the previous daily results, newest last; `vitals` maps id → {lcpMs, cls}. */
export function findVitalRegressions(vitals, history) {
  const recent = history.slice(-BASELINE_DAYS);
  const regressions = [];
  for (const [id, current] of Object.entries(vitals ?? {})) {
    for (const metric of Object.keys(RULES)) {
      const samples = recent.map((day) => day?.vitals?.[id]?.[metric]).filter((v) => typeof v === "number");
      if (samples.length < MIN_SAMPLES) continue;
      const base = median(samples);
      if (isRegression(metric, current?.[metric], base)) {
        regressions.push({ id, metric, value: current[metric], baseline: base, samples: samples.length });
      }
    }
  }
  return regressions;
}
