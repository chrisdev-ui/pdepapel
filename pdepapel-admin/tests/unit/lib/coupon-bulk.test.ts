import { describe, expect, it } from "vitest";

import { couponsToCsv, partitionForDeactivate, partitionForDelete } from "@/lib/coupon-bulk";

const now = new Date("2026-09-18T12:00:00.000Z");
const base = {
  type: "PERCENTAGE" as const,
  amount: 10,
  usedCount: 0,
  minOrderValue: null,
  maxUses: 1,
  isActive: true,
  startDate: new Date("2026-09-01T05:00:00.000Z"),
  endDate: new Date("2026-10-01T04:59:59.999Z"),
};
const vigente = { ...base, id: "a", code: "SOLARIS1ANO", ordersCount: 0 };
const usado = { ...base, id: "b", code: "FERIA-SEPT", ordersCount: 2, usedCount: 2 };
const vencido = { ...base, id: "c", code: "VUELVE-C6418B", ordersCount: 0, endDate: new Date("2026-08-31T04:59:59.999Z") };
const apagado = { ...base, id: "d", code: "MELIPP01", ordersCount: 0, isActive: false };
const rows = [vigente, usado, vencido, apagado];

describe("partitionForDelete", () => {
  it("only deletes coupons without orders and explains each skipped one", () => {
    const { eligible, skipped } = partitionForDelete(rows);
    expect(eligible.map((row) => row.code)).toEqual(["SOLARIS1ANO", "VUELVE-C6418B", "MELIPP01"]);
    expect(skipped).toEqual([{ row: usado, reason: "2 pedidos lo referencian · mejor desactívalo" }]);
    expect(partitionForDelete([{ ...usado, ordersCount: 1 }]).skipped[0].reason).toBe("1 pedido lo referencia · mejor desactívalo");
  });
});

describe("partitionForDeactivate", () => {
  it("switches off active, unexpired coupons and skips the rest with a reason", () => {
    const { eligible, skipped } = partitionForDeactivate(rows, now);
    expect(eligible.map((row) => row.code)).toEqual(["SOLARIS1ANO", "FERIA-SEPT"]);
    expect(skipped.map((entry) => [entry.row.code, entry.reason])).toEqual([
      ["VUELVE-C6418B", "Ya venció: el recálculo diario lo mantiene apagado"],
      ["MELIPP01", "Ya está desactivado"],
    ]);
  });
});

describe("couponsToCsv", () => {
  it("writes one row per coupon with the label the panel shows", () => {
    const csv = couponsToCsv([vigente, { ...usado, type: "FIXED", amount: 5000, minOrderValue: 40000, maxUses: null }], (value) => `$ ${value}`, now);
    expect(csv.split("\n")).toEqual([
      "codigo,descuento,compra_minima,usos,maximo_usos,estado,inicio,fin",
      "SOLARIS1ANO,10 %,,0,1,Vigente,2026-09-01,2026-10-01",
      "FERIA-SEPT,$ 5000,$ 40000,2,sin límite,Vigente,2026-09-01,2026-10-01",
      "",
    ]);
  });
});
