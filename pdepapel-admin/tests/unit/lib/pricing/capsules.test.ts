import { describe, expect, it } from "vitest";

import { gatewayFee } from "@/lib/gateway-fees";
import {
  CAPSULE_PACK_PRICES,
  CAPSULE_SALES_ENABLED,
  capsuleSalesEnabled,
  evaluatePoolMargins,
  maxGiftCostOf,
  packRungs,
  capsuleProvisionalCost,
  capsuleUnitPrice,
  maxPackFor,
  packMargins,
  packSaving,
  seededRandom,
  slipCostBand,
} from "@/lib/pricing/capsules";
import { PaymentMethod } from "@prisma/client";

// Costos de prueba por pack (números redondos; los reales viven en CapsulePackOption).
const options = CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: price.packSize >= 10 ? 2000 : 0, giftMaxItems: price.packSize >= 10 ? 1 : 0, boxReserveCost: 1000 }));
const ladder = packRungs(options);
const rung = (size: number) => ladder.find((row) => row.packSize === size)!;
// Bolsa de prueba (no la real): 100 papeles de 3.000 a 4.980 en pasos de 20.
const pool = Array.from({ length: 100 }, (_, index) => 3000 + index * 20);

describe("escalera de packs (lib/pricing/capsules.ts)", () => {
  it("cada peldaño tiene un precio entero por cápsula, para que ProductPriceTier lo guarde exacto", () => {
    for (const row of CAPSULE_PACK_PRICES) expect(Number.isInteger(capsuleUnitPrice(row))).toBe(true);
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

  it("el código solo guarda precios públicos: el regalo y la caja de cada pack vienen de su configuración", () => {
    for (const price of CAPSULE_PACK_PRICES) expect(Object.keys(price).sort()).toEqual(["packSize", "total"]);
    expect(rung(10)).toMatchObject({ total: 124900, giftMaxCost: 2000, giftMaxItems: 1, boxReserveCost: 1000 });
    expect(() => packRungs(options.filter((option) => option.packSize !== 15))).toThrow("Falta la configuración del pack de 15");
    expect(maxGiftCostOf([{ giftMaxCost: 0 }, { giftMaxCost: 2500 }, { giftMaxCost: 1800 }])).toBe(2500);
    expect(maxGiftCostOf([])).toBe(0);
  });

  it("la venta está encendida; solo una prueba local puede apagarla, nunca en Vercel", () => {
    expect(CAPSULE_SALES_ENABLED).toBe(true);
    expect(capsuleSalesEnabled({})).toBe(true);
    expect(capsuleSalesEnabled({ CAPSULE_SALES_TEST_OVERRIDE: "0" })).toBe(false);
    expect(capsuleSalesEnabled({ CAPSULE_SALES_TEST_OVERRIDE: "0", VERCEL: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(capsuleSalesEnabled({ CAPSULE_SALES_TEST_OVERRIDE: "0", VERCEL: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(capsuleSalesEnabled({ CAPSULE_SALES_TEST_OVERRIDE: "1" })).toBe(true);
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
    const analytic = (row.total - row.packSize * mean - row.giftMaxCost - row.boxReserveCost - result.fee) / row.total;
    expect(result.expected).toBeCloseTo(analytic, 3);
    expect(result.p95).toBeLessThan(result.expected);
    expect(result.worst).toBeLessThan(result.p95);
  });

  it("el peor caso son los n papeles más caros", () => {
    const row = rung(5);
    const worstCost = 4980 + 4960 + 4940 + 4920 + 4900;
    const result = packMargins({ pool, rung: row, runs: 10 });
    expect(result.worst).toBeCloseTo((row.total - worstCost - row.boxReserveCost - result.fee) / row.total, 10);
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

describe("evaluatePoolMargins", () => {
  const options = CAPSULE_PACK_PRICES.map((price) => ({ packSize: price.packSize, giftMaxCost: 3000, giftMaxItems: 1, boxReserveCost: 2000 }));

  it("solo mide los packs que caben en la bolsa y juzga cada uno contra el piso", () => {
    const result = evaluatePoolMargins({ pool: Array.from({ length: 40 }, () => 4000), options, minMarginPct: 20, runs: 500 });
    expect(result.poolSize).toBe(40);
    expect(result.packs.filter((pack) => pack.available).map((pack) => pack.packSize)).toEqual([5, 10]);
    expect(result.packs.filter((pack) => !pack.available).every((pack) => pack.passes === null && pack.p95Pct === null)).toBe(true);
    expect(result.packs.filter((pack) => pack.available).every((pack) => pack.passes === true)).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("un pack bajo el piso hace fallar la bolsa; sin piso no se juzga", () => {
    const expensive = Array.from({ length: 40 }, () => 11000);
    expect(evaluatePoolMargins({ pool: expensive, options, minMarginPct: 20, runs: 500 }).ok).toBe(false);
    const unjudged = evaluatePoolMargins({ pool: expensive, options, minMarginPct: null, runs: 500 });
    expect(unjudged.ok).toBe(true);
    expect(unjudged.packs.filter((pack) => pack.available).every((pack) => pack.passes === null)).toBe(true);
  });
});
