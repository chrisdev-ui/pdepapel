import { describe, expect, it } from "vitest";

import { postMetricRows, visibleColumns } from "@/lib/social/display";
import { RETENTION_MAX_SKIP_PCT, RETENTION_MIN_WATCHED_PCT, retentionWarning, watchedPct } from "@/lib/social/metrics";
import type { SocialPostSummary } from "@/lib/social/report";

describe("retención de un reel", () => {
  it("% visto = tiempo promedio ÷ duración; sin duración o sin tiempo, null", () => {
    expect(watchedPct(4500, 30)).toBe(15);
    expect(watchedPct(3706, 61.8)).toBe(6);
    expect(watchedPct(null, 30)).toBeNull();
    expect(watchedPct(4500, null)).toBeNull();
    expect(watchedPct(4500, 0)).toBeNull();
  });

  it("alerta con menos del 15 % visto o más del 50 % de salto; con un dato faltante decide el otro", () => {
    expect(RETENTION_MIN_WATCHED_PCT).toBe(15);
    expect(RETENTION_MAX_SKIP_PCT).toBe(50);
    expect(retentionWarning({ watchedPct: 14.9, skipRate: 10 })).toBe(true);
    expect(retentionWarning({ watchedPct: 15, skipRate: 50 })).toBe(false);
    expect(retentionWarning({ watchedPct: null, skipRate: 50.1 })).toBe(true);
    expect(retentionWarning({ watchedPct: 40, skipRate: null })).toBe(false);
    expect(retentionWarning({ watchedPct: null, skipRate: null })).toBe(false);
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
