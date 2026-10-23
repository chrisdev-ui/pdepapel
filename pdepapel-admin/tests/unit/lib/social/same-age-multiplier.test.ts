import { describe, expect, it } from "vitest";

import { multiplierText } from "@/lib/social/display";
import { MULTIPLIER_MIN_SAMPLE, sameAgeMultipliers, type AgedPost } from "@/lib/social/metrics";

const HOUR = 3_600_000;
const now = new Date("2026-11-20T15:00:00Z");
const post = (id: string, ageHours: number, readings: [hours: number, views: number | null][]): AgedPost => ({
  id,
  postedAt: new Date(now.getTime() - ageHours * HOUR),
  snapshots: readings.map(([hoursSincePost, views]) => ({ hoursSincePost, views })),
});

describe("«× mediana» a la misma edad", () => {
  it("una publicación joven se compara con las otras a esa misma edad, no con su última lectura", () => {
    const peers = [100, 120, 140, 160, 180].map((views, index) => post(`p${index}`, 300, [[3, views], [168, views * 10]]));
    const young = post("joven", 4, [[3, 300]]);
    const result = sameAgeMultipliers([young, ...peers], now).get("joven")!;
    // Mediana a las 3 h = 140 (no la de 7 días, que es 1.400).
    expect(result).toEqual({ multiplier: 2.1, approx: false, sample: 5 });
  });

  it("con 7 días o más usa la lectura de 7 días; sin ella, la última y queda «aprox.»", () => {
    const withSevenDays = [100, 200, 300, 400, 500].map((views, index) => post(`m${index}`, 400, [[24, 10], [170, views]]));
    const late = post("tarde", 900, [[700, 900]]);
    const result = sameAgeMultipliers([late, ...withSevenDays], now);
    expect(result.get("tarde")).toEqual({ multiplier: 3, approx: true, sample: 5 });
    // Las que sí tienen su lectura de 7 días se comparan con una base que incluye una aproximada.
    // m4: 500 ÷ mediana(100, 200, 300, 400, 900) = 1,7.
    expect(result.get("m4")).toMatchObject({ multiplier: 1.7, approx: true });
  });

  it(`con menos de ${MULTIPLIER_MIN_SAMPLE} para comparar no hay número («pocos datos»); sin lecturas tampoco`, () => {
    const peers = [100, 120, 140, 160].map((views, index) => post(`p${index}`, 300, [[3, views]]));
    const young = post("joven", 4, [[3, 300]]);
    const empty = post("vacía", 4, [[3, null]]);
    const result = sameAgeMultipliers([young, empty, ...peers], now);
    expect(result.get("joven")).toEqual({ multiplier: null, approx: false, sample: 4 });
    expect(result.get("vacía")).toEqual({ multiplier: null, approx: false, sample: 0 });
    expect(multiplierText({ multiplier: null, multiplierApprox: false })).toBe("pocos datos");
    expect(multiplierText({ multiplier: 0.8, multiplierApprox: true })).toBe("0,8× aprox.");
    expect(multiplierText({ multiplier: 2.1, multiplierApprox: false })).toBe("2,1×");
  });

  it("una publicación vista solo vieja no cuenta para comparar a una joven", () => {
    const seenYoung = [100, 120, 140, 160].map((views, index) => post(`p${index}`, 300, [[3, views]]));
    const seenOld = post("vieja", 2000, [[1900, 5000]]);
    const young = post("joven", 4, [[3, 300]]);
    expect(sameAgeMultipliers([young, seenOld, ...seenYoung], now).get("joven")).toMatchObject({ multiplier: null, sample: 4 });
  });
});
