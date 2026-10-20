import { describe, expect, it, vi } from "vitest";

import { bogotaDay, bogotaMinutes, capsuleDayStatus } from "@/lib/capsule-day";

const FAR = new Date("2030-01-01T00:00:00Z");
const db = (override: number | null, used: number, extra: { orderId: string; status: "HELD" | "CONFIRMED"; expiresAt: Date | null; order?: "CANCELLED" | null }[] = []) => {
  const live = Array.from({ length: used }, (_, index) => ({ orderId: `o${index}`, slotNumber: index + 1, status: "CONFIRMED" as const, expiresAt: null }));
  const slots = [...live, ...extra.map((slot, index) => ({ ...slot, slotNumber: used + index + 1 }))];
  const orders = [
    ...live.map((slot) => ({ id: slot.orderId, status: "PAID" })),
    ...extra.filter((slot) => slot.order !== null).map((slot) => ({ id: slot.orderId, status: slot.order ?? "PENDING" })),
  ];
  return {
    capsuleDayCap: { findUnique: vi.fn().mockResolvedValue(override === null ? null : { cap: override }) },
    capsuleDailySlot: { findMany: vi.fn().mockResolvedValue(slots) },
    order: { findMany: vi.fn().mockResolvedValue(orders) },
  };
};
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
    const open = db(null, 2, [{ orderId: "held", status: "HELD", expiresAt: FAR }]);
    await expect(capsuleDayStatus(open, "s1", edition, new Date("2026-10-22T14:00:00Z"))).resolves.toMatchObject({ day: "2026-10-22", cap: 5, used: 3, left: 2, closedReason: null });
    expect(open.capsuleDailySlot.findMany.mock.calls[0][0].where).toEqual({ storeId: "s1", bogotaDate: new Date("2026-10-22T00:00:00.000Z") });
    await expect(capsuleDayStatus(db(8, 5), "s1", edition, new Date("2026-10-22T14:00:00Z"))).resolves.toMatchObject({ cap: 8, left: 3, closedReason: null });
  });

  it("no cuentan los apartados vencidos ni los cupos de pedidos cancelados o borrados", async () => {
    const now = new Date("2026-10-22T14:00:00Z");
    const slots = db(null, 1, [
      { orderId: "vencido", status: "HELD", expiresAt: new Date("2026-10-22T13:00:00Z") },
      { orderId: "cancelado", status: "CONFIRMED", expiresAt: null, order: "CANCELLED" },
      { orderId: "borrado", status: "HELD", expiresAt: FAR, order: null },
    ]);
    await expect(capsuleDayStatus(slots, "s1", edition, now)).resolves.toMatchObject({ used: 1, left: 4 });
  });

  it("sin cupo, el día queda lleno", async () => {
    await expect(capsuleDayStatus(db(null, 5), "s1", edition, new Date("2026-10-22T20:00:00Z"))).resolves.toMatchObject({ left: 0, closedReason: "full" });
  });
});
