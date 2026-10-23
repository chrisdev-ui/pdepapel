import { describe, expect, it } from "vitest";

import { postMetricRows, retentionDetails, visibleColumns } from "@/lib/social/display";
import {
  RETENTION_MIN_SKIP_SAMPLE,
  RETENTION_MIN_WATCHED_PCT,
  RETENTION_SKIP_POINTS_ABOVE_MEDIAN,
  retentionReasons,
  skipBaseline,
  watchedPct,
} from "@/lib/social/metrics";
import type { SocialPostSummary } from "@/lib/social/report";

describe("retención de un reel", () => {
  it("% visto = tiempo promedio ÷ duración; sin duración o sin tiempo, null", () => {
    expect(watchedPct(4500, 30)).toBe(15);
    expect(watchedPct(3706, 61.8)).toBe(6);
    expect(watchedPct(null, 30)).toBeNull();
    expect(watchedPct(4500, null)).toBeNull();
    expect(watchedPct(4500, 0)).toBeNull();
  });

  it("la mediana del salto de la red necesita al menos 5 reels con el dato; los vacíos no cuentan", () => {
    expect(RETENTION_MIN_SKIP_SAMPLE).toBe(5);
    expect(skipBaseline([60, 62, null, 64, 58])).toEqual({ median: null, count: 4 });
    expect(skipBaseline([60, 62, null, 64, 58, 70])).toEqual({ median: 62, count: 5 });
    expect(skipBaseline([50, 60, 62, 64, 70, 72])).toEqual({ median: 63, count: 6 });
  });

  it("alerta con menos del 15 % visto, o con 10 puntos de salto o más por encima de la mediana de su red", () => {
    expect(RETENTION_MIN_WATCHED_PCT).toBe(15);
    expect(RETENTION_SKIP_POINTS_ABOVE_MEDIAN).toBe(10);
    const baseline = { median: 62, count: 11 };
    expect(retentionReasons({ watchedPct: 14.9, skipRate: 10, baseline })).toEqual(["watched"]);
    expect(retentionReasons({ watchedPct: 15, skipRate: 71.9, baseline })).toEqual([]);
    expect(retentionReasons({ watchedPct: 40, skipRate: 72, baseline })).toEqual(["skip"]);
    expect(retentionReasons({ watchedPct: 6, skipRate: 73.8, baseline })).toEqual(["watched", "skip"]);
  });

  it("un salto alto en una cuenta donde todos saltan igual ya no alerta; sin mediana (menos de 5 reels) el salto no decide", () => {
    expect(retentionReasons({ watchedPct: null, skipRate: 65, baseline: { median: 62, count: 11 } })).toEqual([]);
    expect(retentionReasons({ watchedPct: null, skipRate: 95, baseline: { median: null, count: 4 } })).toEqual([]);
    expect(retentionReasons({ watchedPct: null, skipRate: 95, baseline: null })).toEqual([]);
    expect(retentionReasons({ watchedPct: 10, skipRate: 95, baseline: null })).toEqual(["watched"]);
  });

  it("el detalle dice por qué, con el número y lo normal de la red", () => {
    const post = { platform: "INSTAGRAM", watchedPct: 6, skipRate: 73.8, skipMedian: 62 } as const;
    expect(retentionDetails({ ...post, retentionReasons: ["watched", "skip"] })).toEqual([
      "Se ve en promedio el 6 % del video.",
      "El 73,8 % lo salta en los primeros 3 s: 11,8 puntos más que lo normal en Instagram (62 %).",
    ]);
    expect(retentionDetails({ ...post, retentionReasons: [] })).toEqual([]);
  });
});

describe("columnas de la tabla por red", () => {
  const labels = (filter: Parameters<typeof visibleColumns>[0]) => visibleColumns(filter).map((column) => column.label);

  it("Todas e Instagram muestran alcance, tiempo promedio, % visto, salto y duración", () => {
    for (const filter of ["ALL", "INSTAGRAM"] as const) {
      expect(labels(filter)).toEqual(expect.arrayContaining(["Alcance", "Tiempo promedio (s)", "% visto", "Salto 3 s", "Duración", "Guardados"]));
    }
  });

  it("con TikTok se ocultan las que TikTok no da; la duración sí queda", () => {
    expect(labels("TIKTOK")).not.toEqual(expect.arrayContaining(["Alcance"]));
    for (const hidden of ["Alcance", "Guardados", "Tiempo promedio (s)", "% visto", "Salto 3 s"]) expect(labels("TIKTOK")).not.toContain(hidden);
    expect(labels("TIKTOK")).toEqual(expect.arrayContaining(["Vistas", "Duración", "Compartidos"]));
  });

  it("en «Todas» una publicación de TikTok muestra «—» en lo que no tiene", () => {
    const tiktok = { reach: null, saves: null, avgWatchTimeMs: null, watchedPct: null, skipRate: null } as SocialPostSummary;
    for (const column of visibleColumns("ALL").filter((item) => ["reach", "saves", "avgWatch", "watched", "skip"].includes(item.key))) expect(column.cell(tiktok)).toBe("—");
  });
});

describe("detalle de la publicación", () => {
  it("lista todas las métricas guardadas, con «—» donde no hay dato", () => {
    const post = {
      views: 1200,
      reach: 900,
      likes: 80,
      comments: 4,
      shares: 6,
      saves: 12,
      totalInteractions: 102,
      engagementRate: 11.3,
      avgWatchTimeMs: 4500,
      totalWatchSeconds: 5400,
      watchedPct: 15,
      skipRate: 62.4,
      durationSec: 30,
    } as SocialPostSummary;
    expect(postMetricRows(post)).toEqual([
      ["Vistas", "1.200"],
      ["Alcance", "900"],
      ["Me gusta", "80"],
      ["Comentarios", "4"],
      ["Compartidos", "6"],
      ["Guardados", "12"],
      ["Interacciones", "102"],
      ["Interacción", "11,3 %"],
      ["Tiempo promedio", "4,5 s"],
      ["Tiempo total visto", "1,5 h"],
      ["% visto", "15 %"],
      ["Salto en 3 s", "62,4 %"],
      ["Duración", "30 s"],
    ]);
    expect(postMetricRows({ ...post, reach: null, skipRate: null }).filter(([, value]) => value === "—").map(([label]) => label)).toEqual(["Alcance", "Salto en 3 s"]);
  });
});
