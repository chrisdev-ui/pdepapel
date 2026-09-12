import { describe, expect, it } from "vitest";

import {
  computeRunningBalanceCheck,
  describeAdjustmentCounts,
  describeWho,
  formatKardexDate,
  formatKardexMonth,
  formatSignedQuantity,
  MOVEMENT_LABELS,
  MOVEMENT_TONES,
  summarizeKardex,
} from "@/lib/kardex";

const now = new Date("2026-09-12T15:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("computeRunningBalanceCheck", () => {
  it("is balanced when the latest movement balance equals the product stock", () => {
    expect(computeRunningBalanceCheck({ newStock: 7 }, 7)).toEqual({ balanced: true, latestBalance: 7 });
  });

  it("flags a mismatch and keeps the latest balance to show it", () => {
    expect(computeRunningBalanceCheck({ newStock: 7 }, 5)).toEqual({ balanced: false, latestBalance: 7 });
  });

  it("has nothing to compare without movements", () => {
    expect(computeRunningBalanceCheck(null, 3)).toEqual({ balanced: true, latestBalance: null });
  });
});

describe("summarizeKardex", () => {
  it("nets 30-day sales against cancellations and derives weekly rate and cover days", () => {
    const metrics = summarizeKardex(
      [
        { type: "ORDER_PLACED", quantity: -4, createdAt: daysAgo(1) },
        { type: "IN_PERSON_SALE", quantity: -3, createdAt: daysAgo(10) },
        { type: "ORDER_CANCELLED", quantity: 1, createdAt: daysAgo(5) },
        // Fuera de los 30 días: no cuenta como venta.
        { type: "ORDER_PLACED", quantity: -10, createdAt: daysAgo(40) },
      ],
      { stock: 12, latest: { newStock: 12 }, now },
    );
    expect(metrics.sold30).toBe(6);
    expect(metrics.weeklyRate).toBe(1.4);
    // 12 / (6/30) = 60 días.
    expect(metrics.coverDays).toBe(60);
    expect(metrics.balanced).toBe(true);
  });

  it("returns null cover days when nothing sold in 30 days", () => {
    const metrics = summarizeKardex([{ type: "ORDER_PLACED", quantity: -2, createdAt: daysAgo(45) }], { stock: 9, latest: { newStock: 9 }, now });
    expect(metrics.sold30).toBe(0);
    expect(metrics.weeklyRate).toBe(0);
    expect(metrics.coverDays).toBeNull();
  });

  it("counts receipts and signed adjustments inside 90 days only", () => {
    const metrics = summarizeKardex(
      [
        { type: "RESTOCK_RECEIVED", quantity: 20, createdAt: daysAgo(3) },
        { type: "PURCHASE", quantity: 5, createdAt: daysAgo(80) },
        { type: "RESTOCK_RECEIVED", quantity: 50, createdAt: daysAgo(120) },
        { type: "DAMAGE", quantity: -2, createdAt: daysAgo(4) },
        { type: "MANUAL_ADJUSTMENT", quantity: 3, createdAt: daysAgo(6) },
        { type: "LOST", quantity: -1, createdAt: daysAgo(7) },
        { type: "LOST", quantity: -4, createdAt: daysAgo(100) },
        { type: "FESTIVAL_ALLOCATION", quantity: -8, createdAt: daysAgo(2) },
      ],
      { stock: 30, latest: { newStock: 28 }, now },
    );
    expect(metrics.received90).toBe(25);
    expect(metrics.receipts90).toBe(2);
    expect(metrics.adjustments90).toEqual({ total: 0, byType: { DAMAGE: 1, MANUAL_ADJUSTMENT: 1, LOST: 1 } });
    expect(metrics.balanced).toBe(false);
    expect(metrics.latestBalance).toBe(28);
  });

  it("takes sales, rate and cover from paid orders when given, like Inventario, and keeps the ledger for receipts", () => {
    const metrics = summarizeKardex(
      [
        { type: "ORDER_PLACED", quantity: -4, createdAt: daysAgo(1) },
        { type: "RESTOCK_RECEIVED", quantity: 20, createdAt: daysAgo(3) },
      ],
      { stock: 2, latest: { newStock: 2 }, now, sales: { sold30: 0, sold90: 18, viaKits30: 0, onOrder: 0, threshold: 3 } },
    );
    expect(metrics.sold30).toBe(0);
    expect(metrics.sold90).toBe(18);
    expect(metrics.rateWindowDays).toBe(90);
    expect(metrics.weeklyRate).toBe(1.4);
    expect(metrics.coverDays).toBe(10);
    expect(metrics.received90).toBe(20);
  });

  it("ignores movements dated in the future", () => {
    const metrics = summarizeKardex([{ type: "ORDER_PLACED", quantity: -2, createdAt: new Date(now.getTime() + 60_000) }], { stock: 9, latest: null, now });
    expect(metrics.sold30).toBe(0);
  });
});

describe("describeWho", () => {
  const names = new Map([["user_1", "Camila"]]);

  it("resolves USER_ ids to the first name and falls back to Usuario", () => {
    expect(describeWho("USER_user_1", "MANUAL_ADJUSTMENT", names)).toBe("Camila");
    expect(describeWho("USER_unknown", "MANUAL_ADJUSTMENT", names)).toBe("Usuario");
  });

  it("labels every SYSTEM* actor as Sistema", () => {
    expect(describeWho("SYSTEM", "ORDER_PLACED", names)).toBe("Sistema");
    expect(describeWho("SYSTEM_BOLD", "ORDER_PLACED", names)).toBe("Sistema");
    expect(describeWho("SYSTEM_MIGRATION_SCRIPT", "INITIAL_MIGRATION", names)).toBe("Sistema");
  });

  it("treats a missing actor as the storefront only for online sales", () => {
    expect(describeWho(null, "ORDER_PLACED", names)).toBe("Tienda en línea");
    expect(describeWho(null, "IN_PERSON_SALE", names)).toBe("—");
    expect(describeWho(undefined, "DAMAGE", names)).toBe("—");
  });
});

describe("labels and tones", () => {
  it("has a Spanish label and a tone for every movement type", () => {
    const types = Object.keys(MOVEMENT_LABELS);
    expect(types).toHaveLength(15);
    for (const type of types) {
      expect(MOVEMENT_LABELS[type as keyof typeof MOVEMENT_LABELS]).not.toBe("");
      expect(["mint", "cream", "sky", "pink", "lavender", "slate"]).toContain(MOVEMENT_TONES[type as keyof typeof MOVEMENT_TONES]);
    }
    expect(MOVEMENT_LABELS.ORDER_PLACED).toBe("Venta");
    expect(MOVEMENT_LABELS.IN_PERSON_SALE).toBe("Venta presencial");
    expect(MOVEMENT_LABELS.RESTOCK_RECEIVED).toBe("Recepción");
    expect(MOVEMENT_LABELS.PURCHASE).toBe("Recepción");
    expect(MOVEMENT_TONES.DAMAGE).toBe("pink");
    expect(MOVEMENT_TONES.LOST).toBe("pink");
  });

  it("describes adjustment counts in Spanish with plurals", () => {
    expect(describeAdjustmentCounts({ MANUAL_ADJUSTMENT: 2, DAMAGE: 1 })).toBe("2 ajustes · 1 daño");
    expect(describeAdjustmentCounts({})).toBe("Sin ajustes en 90 días");
  });
});

describe("formatters", () => {
  it("formats dates in Bogotá time as «día mes · hh:mm»", () => {
    // 22:08 UTC = 17:08 en Bogotá (UTC-5).
    expect(formatKardexDate(new Date("2026-09-11T22:08:00.000Z"))).toBe("11 sept · 17:08");
    expect(formatKardexDate("2026-01-01T03:30:00.000Z")).toBe("31 dic · 22:30");
  });

  it("formats the first-movement month", () => {
    expect(formatKardexMonth(new Date("2025-03-15T12:00:00.000Z"))).toBe("marzo de 2025");
  });

  it("formats signed quantities with a true minus sign", () => {
    expect(formatSignedQuantity(3)).toBe("+3");
    expect(formatSignedQuantity(-2)).toBe("−2");
    expect(formatSignedQuantity(0)).toBe("+0");
    expect(formatSignedQuantity(1500)).toBe("+1.500");
  });
});
