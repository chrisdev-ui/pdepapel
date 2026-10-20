import { describe, expect, it } from "vitest";

import { gatewayFee } from "@/lib/gateway-fees";
import {
  CAPSULE_PACK_LADDER,
  CAPSULE_SALES_ENABLED,
  capsuleProvisionalCost,
  capsuleUnitPrice,
  maxPackFor,
  packMargins,
  packSaving,
  seededRandom,
  slipCostBand,
} from "@/lib/pricing/capsules";
import { PaymentMethod } from "@prisma/client";

const rung = (size: number) => CAPSULE_PACK_LADDER.find((row) => row.packSize === size)!;
// Bolsa de prueba (no la real): 100 papeles de 3.000 a 4.980 en pasos de 20.
const pool = Array.from({ length: 100 }, (_, index) => 3000 + index * 20);

describe("escalera de packs (lib/pricing/capsules.ts)", () => {
  it("cada peldaño tiene un precio entero por cápsula, para que ProductPriceTier lo guarde exacto", () => {
    for (const row of CAPSULE_PACK_LADDER) expect(Number.isInteger(capsuleUnitPrice(row))).toBe(true);
    expect(capsuleUnitPrice(rung(15))).toBe(11990);
    expect(rung(15).total).toBe(179850);
  });

  it("«Ahorras» se mide contra el precio por cápsula del pack de 5", () => {
    expect(packSaving(rung(5))).toBe(0);
    expect(packSaving(rung(10))).toBe(4100);
    expect(packSaving(rung(15))).toBe(13650);
    expect(packSaving(rung(30))).toBe(47100);
  });

  it("ningún pack pasa del 25 % de los papeles que quedan", () => {
    expect(maxPackFor(128)).toBe(30);
    expect(maxPackFor(120)).toBe(30);
    expect(maxPackFor(119)).toBe(25);
    expect(maxPackFor(100)).toBe(25);
    expect(maxPackFor(80)).toBe(20);
    expect(maxPackFor(60)).toBe(15);
    expect(maxPackFor(40)).toBe(10);
    expect(maxPackFor(20)).toBe(5);
    expect(maxPackFor(19)).toBeNull();
  });

  it("el costo provisional es la media × el pack + el tope del regalo, y nunca 0", () => {
    expect(capsuleProvisionalCost({ averageSlipCost: 4144.5, packSize: 10, giftMaxCost: 2000 })).toBe(43445);
    expect(() => capsuleProvisionalCost({ averageSlipCost: 0, packSize: 5, giftMaxCost: 0 })).toThrow();
  });

  it("la venta arranca apagada", () => {
    expect(CAPSULE_SALES_ENABLED).toBe(false);
  });
});

describe("margen de un pack", () => {
  it("usa la comisión de Bold en línea de la función compartida", () => {
    expect(packMargins({ pool, rung: rung(10), runs: 10 }).fee).toBe(gatewayFee(124900, PaymentMethod.Bold));
  });

  it("el esperado del Monte Carlo coincide con el analítico (media de la bolsa) y el P95 queda por debajo", () => {
    const row = rung(10);
    const result = packMargins({ pool, rung: row, runs: 20000, seed: 7 });
    const mean = pool.reduce((a, b) => a + b, 0) / pool.length;
    const analytic = (row.total - row.packSize * mean - row.giftMaxCost - row.boxCost - result.fee) / row.total;
    expect(result.expected).toBeCloseTo(analytic, 3);
    expect(result.p95).toBeLessThan(result.expected);
    expect(result.worst).toBeLessThan(result.p95);
  });

  it("el peor caso son los n papeles más caros", () => {
    const row = rung(5);
    const worstCost = 4980 + 4960 + 4940 + 4920 + 4900;
    const result = packMargins({ pool, rung: row, runs: 10 });
    expect(result.worst).toBeCloseTo((row.total - worstCost - row.boxCost - result.fee) / row.total, 10);
  });

  it("con la misma semilla da el mismo resultado", () => {
    expect(packMargins({ pool, rung: rung(20), runs: 2000, seed: 3 })).toEqual(packMargins({ pool, rung: rung(20), runs: 2000, seed: 3 }));
    const random = seededRandom(1);
    expect(random()).toBeGreaterThanOrEqual(0);
  });

  it("resume la banda de costo de una bolsa", () => {
    expect(slipCostBand([5000, 3000, 4000])).toMatchObject({ min: 3000, max: 5000, mean: 4000, p50: 4000 });
    expect(slipCostBand([])).toBeNull();
  });
});
