export const SHADOW_REPORT_DAYS = 7;

const NO_MATCH_OUTCOMES = new Set(["escalated_no_match", "replied_product_unsure"]);

export interface ShadowRunRow {
  intent: string | null;
  plannedCount: number;
  realCount: number;
  realOutcome: string;
  productsFound: boolean | null;
  classifierStatus: string;
  skipReason: string | null;
}

export interface ShadowReport {
  evaluated: number;
  realPerInbound: number;
  shadowPerInbound: number;
  intents: { intent: string; count: number }[];
  silences: { reason: string; count: number }[];
  realNoMatch: number;
  realNoMatchShadowFound: number;
  classifierFailures: number;
}

const ratio = (sum: number, count: number) => (count > 0 ? Math.round((sum / count) * 100) / 100 : 0);

const ranked = (counts: Map<string, number>) =>
  Array.from(counts.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

/** Real contra sombra en los últimos días: mensajes por mensaje, intenciones y «Esa no me la sé». */
export function summarizeShadowRuns(rows: ShadowRunRow[]): ShadowReport {
  const intents = new Map<string, number>();
  const silences = new Map<string, number>();
  let realNoMatch = 0;
  let realNoMatchShadowFound = 0;
  let classifierFailures = 0;
  for (const row of rows) {
    const intent = row.intent ?? (row.classifierStatus === "skipped" ? "Sin clasificar (frenos)" : "Sin clasificar (falló)");
    intents.set(intent, (intents.get(intent) ?? 0) + 1);
    if (row.plannedCount === 0 && row.skipReason) silences.set(row.skipReason, (silences.get(row.skipReason) ?? 0) + 1);
    if (NO_MATCH_OUTCOMES.has(row.realOutcome)) {
      realNoMatch += 1;
      if (row.productsFound) realNoMatchShadowFound += 1;
    }
    if (row.classifierStatus !== "ok" && row.classifierStatus !== "skipped") classifierFailures += 1;
  }
  return {
    evaluated: rows.length,
    realPerInbound: ratio(rows.reduce((sum, row) => sum + row.realCount, 0), rows.length),
    shadowPerInbound: ratio(rows.reduce((sum, row) => sum + row.plannedCount, 0), rows.length),
    intents: ranked(intents).map(({ key, count }) => ({ intent: key, count })),
    silences: ranked(silences).map(({ key, count }) => ({ reason: key, count })),
    realNoMatch,
    realNoMatchShadowFound,
    classifierFailures,
  };
}
