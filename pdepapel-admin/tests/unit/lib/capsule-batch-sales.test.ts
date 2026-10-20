import { describe, expect, it } from "vitest";

import { fifoSoldByBatch } from "@/lib/capsule-batch-sales";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const batch = (id: string, quantity: number, createdAt: Date, capsuleProductId = "cap", unpackedAt: Date | null = null) => ({ id, quantity, createdAt, capsuleProductId, unpackedAt });

describe("fifoSoldByBatch («N vendidas» por lote)", () => {
  it("con dos lotes del mismo producto, lo vendido sale primero del más viejo", () => {
    // 10 + 10 empacadas, quedan 15: se vendieron 5, todas del primer lote.
    const sold = fifoSoldByBatch([batch("nuevo", 10, day(5)), batch("viejo", 10, day(1))], new Map([["cap", 15]]));
    expect(sold.get("viejo")).toBe(5);
    expect(sold.get("nuevo")).toBe(0);
  });

  it("cuando el viejo se agota, sigue con el siguiente", () => {
    const sold = fifoSoldByBatch([batch("a", 10, day(1)), batch("b", 10, day(2)), batch("c", 10, day(3))], new Map([["cap", 7]]));
    expect([sold.get("a"), sold.get("b"), sold.get("c")]).toEqual([10, 10, 3]);
  });

  it("un lote deshecho no cuenta, y cada producto cápsula se reparte por separado", () => {
    const sold = fifoSoldByBatch(
      [batch("a", 10, day(1), "cap", day(2)), batch("b", 4, day(3)), batch("x", 6, day(1), "otra")],
      new Map([["cap", 4], ["otra", 1]]),
    );
    expect([sold.get("a"), sold.get("b"), sold.get("x")]).toEqual([0, 0, 5]);
  });

  it("más stock que lo empacado (entrada manual) no da ventas negativas", () => {
    expect(fifoSoldByBatch([batch("a", 5, day(1))], new Map([["cap", 9]])).get("a")).toBe(0);
  });
});
