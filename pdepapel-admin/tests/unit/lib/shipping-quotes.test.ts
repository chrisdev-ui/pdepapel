import { describe, expect, it } from "vitest";

import {
  describeRequote,
  groupQuotes,
  pickAfterRequote,
} from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/quotes";

const quote = (idRate: number, carrier: string, totalCost: number) =>
  ({ idRate, carrier, totalCost, product: "Estándar", deliveryDays: 2, flete: totalCost - 500, minimumInsurance: 500, isCOD: true }) as never;

describe("groupQuotes", () => {
  it("keeps the cheapest rate per carrier first and the rest apart", () => {
    const { primary, rest } = groupQuotes([quote(1, "TCC", 12000), quote(2, "Servientrega", 9800), quote(3, "TCC", 9000)]);
    expect(primary.map((q) => q.idRate)).toEqual([3, 2]);
    expect(rest.map((q) => q.idRate)).toEqual([1]);
  });
});

describe("pickAfterRequote", () => {
  it("keeps the carrier that was chosen when it still covers the destination", () => {
    const pick = pickAfterRequote([quote(1, "TCC", 9000), quote(2, "Servientrega", 10400)], "Servientrega");
    expect(pick?.idRate).toBe(2);
  });

  it("falls back to the cheapest when the previous carrier is gone", () => {
    const pick = pickAfterRequote([quote(1, "TCC", 9000), quote(2, "Coordinadora", 10400)], "Servientrega");
    expect(pick?.idRate).toBe(1);
  });
});

describe("describeRequote", () => {
  it("says nothing on the first quote or when nothing visible changed", () => {
    expect(describeRequote(null, quote(1, "TCC", 9000))).toBeNull();
    expect(describeRequote({ carrier: "TCC", cost: 9000 }, quote(1, "TCC", 9000))).toBeNull();
  });

  it("announces a price change on the kept carrier", () => {
    expect(describeRequote({ carrier: "Servientrega", cost: 9800 }, quote(2, "Servientrega", 10400))).toEqual({
      kind: "price",
      carrier: "Servientrega",
      from: 9800,
      to: 10400,
    });
  });

  it("announces a carrier swap", () => {
    expect(describeRequote({ carrier: "Servientrega", cost: 9800 }, quote(1, "TCC", 9000))).toEqual({
      kind: "carrier",
      previous: "Servientrega",
      carrier: "TCC",
      cost: 9000,
    });
  });
});
