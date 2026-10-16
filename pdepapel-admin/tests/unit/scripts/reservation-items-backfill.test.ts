import { describe, expect, it, vi } from "vitest";

import { applyReservationItemsBackfill } from "@/scripts/lib/reservation-items-backfill.mjs";

const plan = {
  missing: [{ id: "r-1", storeId: "s-1", productId: "p-1", quantity: 2, unbackedAt: null, createdBy: "u-1", createdAt: new Date("2026-10-15T00:00:00Z") }],
};
const deadlock = Object.assign(new Error("Transaction failed due to a write conflict or a deadlock"), { code: "P2034" });

describe("backfill de ítems de reserva", () => {
  it("un deadlock con otra corrida se reintenta y no se duplica", async () => {
    const createMany = vi.fn().mockRejectedValueOnce(deadlock).mockResolvedValueOnce({ count: 0 });
    await expect(applyReservationItemsBackfill({ stockReservationItem: { createMany } }, plan)).resolves.toBe(0);
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[1][0]).toMatchObject({ skipDuplicates: true });
  });

  it("otro error no se reintenta, y tras tres deadlocks se rinde", async () => {
    const other = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "P2002" }));
    await expect(applyReservationItemsBackfill({ stockReservationItem: { createMany: other } }, plan)).rejects.toMatchObject({ code: "P2002" });
    expect(other).toHaveBeenCalledTimes(1);

    const stuck = vi.fn().mockRejectedValue(deadlock);
    await expect(applyReservationItemsBackfill({ stockReservationItem: { createMany: stuck } }, plan)).rejects.toMatchObject({ code: "P2034" });
    expect(stuck).toHaveBeenCalledTimes(3);
  });
});
