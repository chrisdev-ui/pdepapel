import { describe, expect, it } from "vitest";

import { BEST_TIME_BANDS, BEST_TIME_DAYS, bestTimeGrid, bestTimeLevel } from "@/lib/social/best-time";

const post = (platform: "INSTAGRAM" | "TIKTOK", day: string, band: string, multiplier: number | null, multiplierApprox = false) => ({
  platform,
  multiplier,
  multiplierApprox,
  autoTags: [
    { group: "TIPO" as const, label: "Reel" },
    { group: "DIA" as const, label: day },
    { group: "FRANJA" as const, label: band },
  ],
});

describe("mejor horario", () => {
  it("semana de lunes a domingo, franjas de madrugada a noche", () => {
    expect(BEST_TIME_DAYS).toEqual(["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]);
    expect(BEST_TIME_BANDS).toEqual(["madrugada", "mañana", "mediodía", "tarde", "noche"]);
  });

  it("mediana por casilla solo con 2 o más publicaciones; separa las redes", () => {
    const grids = bestTimeGrid([
      post("INSTAGRAM", "martes", "tarde", 1.2),
      post("INSTAGRAM", "martes", "tarde", 2, true),
      post("INSTAGRAM", "martes", "tarde", null),
      post("INSTAGRAM", "jueves", "noche", 3),
      post("TIKTOK", "lunes", "mañana", 0.5),
      post("TIKTOK", "lunes", "mañana", 0.7),
    ]);
    const [instagram, tiktok] = grids;
    expect(instagram.rows).toHaveLength(7);
    expect(instagram.rows[1][3]).toEqual({ day: "martes", band: "tarde", count: 3, medianMultiplier: 1.6, approx: true });
    expect(instagram.rows[3][4]).toMatchObject({ day: "jueves", band: "noche", count: 1, medianMultiplier: null, approx: false });
    expect(instagram).toMatchObject({ filled: 1, approx: true });
    expect(tiktok.rows[0][1]).toMatchObject({ medianMultiplier: 0.6, approx: false });
    expect(tiktok).toMatchObject({ filled: 1, approx: false });
  });

  it("dos publicaciones sin «× mediana» no dan número", () => {
    const [grid] = bestTimeGrid([post("INSTAGRAM", "lunes", "tarde", null), post("INSTAGRAM", "lunes", "tarde", null)]);
    expect(grid.rows[0][3]).toMatchObject({ count: 2, medianMultiplier: null });
    expect(grid.filled).toBe(0);
  });

  it("tonos fijos frente a la mediana de la red", () => {
    expect([null, 0.5, 0.8, 1.19, 1.2, 1.6, 3].map(bestTimeLevel)).toEqual([0, 1, 2, 2, 3, 4, 4]);
  });
});
