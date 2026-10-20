import { describe, expect, it, vi } from "vitest";

import { bogotaDay, bogotaMinutes, capsuleDayStatus } from "@/lib/capsule-day";

const db = (override: number | null, used: number) => ({
  capsuleDayCap: { findUnique: vi.fn().mockResolvedValue(override === null ? null : { cap: override }) },
  capsuleDailySlot: { count: vi.fn().mockResolvedValue(used) },
});
const edition = { dailyOrderCap: 5, opensAtLocal: "08:00" };

describe("cupos del día de cápsulas", () => {
  it("el día y la hora son los de Bogotá", () => {
    expect(bogotaDay(new Date("2026-10-22T04:59:00Z"))).toBe("2026-10-21");
    expect(bogotaDay(new Date("2026-10-22T05:00:00Z"))).toBe("2026-10-22");
    expect(bogotaMinutes(new Date("2026-10-22T13:00:00Z"))).toBe(8 * 60);
  });

  it("antes de las 8:00 de Bogotá todavía no abren", async () => {
    await expect(capsuleDayStatus(db(null, 0), "s1", edition, new Date("2026-10-22T12:59:00Z"))).resolves.toMatchObject({ cap: 5, left: 5, closedReason: "before-open" });
  });

  it("cuenta confirmados y apartados vigentes, con el tope del día si la dueña lo cambió", async () => {
    const open = db(null, 3);
    await expect(capsuleDayStatus(open, "s1", edition, new Date("2026-10-22T14:00:00Z"))).resolves.toMatchObject({ day: "2026-10-22", cap: 5, used: 3, left: 2, closedReason: null });
    const where = open.capsuleDailySlot.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ storeId: "s1", bogotaDate: new Date("2026-10-22T00:00:00.000Z") });
    expect(JSON.stringify(where.OR)).toContain("HELD");
    await expect(capsuleDayStatus(db(8, 5), "s1", edition, new Date("2026-10-22T14:00:00Z"))).resolves.toMatchObject({ cap: 8, left: 3, closedReason: null });
  });

  it("sin cupo, el día queda lleno", async () => {
    await expect(capsuleDayStatus(db(null, 5), "s1", edition, new Date("2026-10-22T20:00:00Z"))).resolves.toMatchObject({ left: 0, closedReason: "full" });
  });
});
