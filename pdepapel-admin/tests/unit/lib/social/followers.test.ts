import { describe, expect, it } from "vitest";

import { dailyFollowers, FOLLOWER_SERIES_DAYS, followerSpanFloor } from "@/lib/social/followers";

const at = (iso: string, followers: number | null) => ({ capturedAt: new Date(iso), followers });
const now = new Date("2026-11-20T15:00:00Z");

describe("seguidores por día (Bogotá)", () => {
  it("toma la última lectura de cada día de Bogotá; las 23:00 de Bogotá siguen siendo ese día aunque en UTC ya sea el siguiente", () => {
    const result = dailyFollowers(
      [
        at("2026-11-19T09:00:00Z", 100),
        at("2026-11-20T03:30:00Z", 105), // 19 nov. 22:30 en Bogotá: cuenta para el 19
        at("2026-11-20T14:00:00Z", 110),
        at("2026-11-20T14:30:00Z", null),
      ],
      now,
    );
    expect(result.series).toEqual([
      { day: "2026-11-19", followers: 105, change: null },
      { day: "2026-11-20", followers: 110, change: 5 },
    ]);
    expect(result.since).toBe("2026-11-19");
  });

  it("el cambio a 7 y 30 días usa la última lectura de ese día o de antes; sin base, null («pocos datos»)", () => {
    const snapshots = [at("2026-10-20T20:00:00Z", 900), at("2026-11-10T20:00:00Z", 980), at("2026-11-13T20:00:00Z", 1000), at("2026-11-20T14:00:00Z", 1012)];
    const result = dailyFollowers(snapshots, now);
    expect(result.delta7).toBe(12);
    expect(result.delta30).toBe(112);
    const young = dailyFollowers([at("2026-11-17T20:00:00Z", 50), at("2026-11-20T14:00:00Z", 58)], now);
    expect(young).toMatchObject({ delta7: null, delta30: null, since: "2026-11-17" });
  });

  it("la serie muestra los últimos 30 días; el cambio del primero mostrado usa el día anterior aunque quede fuera", () => {
    const snapshots = Array.from({ length: 40 }, (_, index) => at(new Date(Date.UTC(2026, 9, 12 + index, 20)).toISOString(), 1000 + index));
    const result = dailyFollowers(snapshots, now);
    expect(result.series).toHaveLength(FOLLOWER_SERIES_DAYS);
    expect(result.series[0]).toMatchObject({ day: "2026-10-22", change: 1 });
    expect(result.since).toBe("2026-10-12");
  });

  it("sin lecturas: serie vacía y sin «desde»", () => {
    expect(dailyFollowers([], now)).toEqual({ series: [], delta7: null, delta30: null, since: null });
  });

  it("la línea no agranda un cambio chico: el alto cubre al menos el 2 % de los seguidores (mínimo 20)", () => {
    expect(followerSpanFloor(3551)).toBe(71);
    expect(followerSpanFloor(28239)).toBe(565);
    expect(followerSpanFloor(300)).toBe(20);
  });
});
