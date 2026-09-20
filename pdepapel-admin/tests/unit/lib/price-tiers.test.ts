import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildLadder,
  findTier,
  resolveUnitPrice,
  sortTiers,
  validateTiers,
} from "@/lib/price-tiers";

/**
 * La escalera real que la tienda ya vendió en producción (línea M de cápsulas),
 * como fixture: −$500 por unidad en cada peldaño.
 */
const M_LINE = [
  { minQuantity: 1, unitPrice: 12000 },
  { minQuantity: 3, unitPrice: 11500 },
  { minQuantity: 5, unitPrice: 11000 },
  { minQuantity: 10, unitPrice: 10500 },
  { minQuantity: 15, unitPrice: 10000 },
];

describe("findTier", () => {
  it("gana el peldaño más alto que no pasa de la cantidad", () => {
    expect(findTier(M_LINE, 1)?.unitPrice).toBe(12000);
    expect(findTier(M_LINE, 2)?.unitPrice).toBe(12000);
    expect(findTier(M_LINE, 3)?.unitPrice).toBe(11500);
    expect(findTier(M_LINE, 4)?.unitPrice).toBe(11500);
    expect(findTier(M_LINE, 5)?.unitPrice).toBe(11000);
    expect(findTier(M_LINE, 9)?.unitPrice).toBe(11000);
    expect(findTier(M_LINE, 10)?.unitPrice).toBe(10500);
    expect(findTier(M_LINE, 100)?.unitPrice).toBe(10000);
  });

  it("sin escalera o con cantidad por debajo del primer peldaño no hay peldaño", () => {
    expect(findTier([], 10)).toBeNull();
    expect(findTier([{ minQuantity: 5, unitPrice: 900 }], 4)).toBeNull();
  });

  it("no depende del orden en que vengan las filas", () => {
    const shuffled = [...M_LINE].reverse();
    expect(findTier(shuffled, 7)?.unitPrice).toBe(11000);
    expect(sortTiers(shuffled).map((tier) => tier.minQuantity)).toEqual([1, 3, 5, 10, 15]);
  });
});

describe("resolveUnitPrice: nunca encadena oferta y peldaño", () => {
  const tiers = [{ minQuantity: 10, unitPrice: 9000 }];

  it("sin oferta ni peldaño cobra el precio de lista", () => {
    const result = resolveUnitPrice({ basePrice: 10000, quantity: 1 });
    expect(result.unitPrice).toBe(10000);
    expect(result.source).toBe("base");
  });

  it("gana la oferta cuando deja el precio más bajo", () => {
    // Oferta a 8.500 contra peldaño de 9.000: gana la oferta.
    const result = resolveUnitPrice({
      basePrice: 10000,
      offerPrice: 8500,
      offerLabel: "Cápsulas −15",
      tiers,
      quantity: 12,
    });
    expect(result.unitPrice).toBe(8500);
    expect(result.source).toBe("offer");
    expect(result.offerLabel).toBe("Cápsulas −15");
    // Lo que NO puede pasar: 8.500 rebajado otra vez por el peldaño.
    expect(result.unitPrice).toBeGreaterThan(8500 * 0.9);
  });

  it("gana el peldaño cuando deja el precio más bajo", () => {
    const result = resolveUnitPrice({
      basePrice: 10000,
      offerPrice: 9500,
      offerLabel: "Cápsulas −5",
      tiers,
      quantity: 12,
    });
    expect(result.unitPrice).toBe(9000);
    expect(result.source).toBe("tier");
    expect(result.tierMinQuantity).toBe(10);
    // Al ganar el peldaño, la etiqueta de la oferta no se muestra: no se aplicó.
    expect(result.offerLabel).toBeNull();
  });

  it("en empate gana la oferta, que es la que ya está anunciada", () => {
    const result = resolveUnitPrice({
      basePrice: 10000,
      offerPrice: 9000,
      offerLabel: "Cápsulas −10",
      tiers,
      quantity: 12,
    });
    expect(result.unitPrice).toBe(9000);
    expect(result.source).toBe("offer");
  });

  it("un peldaño más caro que el precio de lista se ignora", () => {
    const result = resolveUnitPrice({
      basePrice: 10000,
      tiers: [{ minQuantity: 2, unitPrice: 12000 }],
      quantity: 5,
    });
    expect(result.unitPrice).toBe(10000);
    expect(result.source).toBe("base");
  });

  it("la cantidad se normaliza: 0, negativos y decimales no rompen el precio", () => {
    for (const quantity of [0, -3, 1.7, NaN]) {
      const result = resolveUnitPrice({ basePrice: 10000, tiers, quantity });
      expect(Number.isFinite(result.unitPrice)).toBe(true);
      expect(result.unitPrice).toBe(10000);
    }
  });
});

describe("buildLadder", () => {
  it("agrega el peldaño 1 al precio de lista cuando la escalera no lo trae", () => {
    const ladder = buildLadder(12000, [{ minQuantity: 5, unitPrice: 11000 }]);
    expect(ladder.map((rung) => rung.minQuantity)).toEqual([1, 5]);
    expect(ladder[0].unitPrice).toBe(12000);
    expect(ladder[1].savedPerUnit).toBe(1000);
    expect(ladder[1].savedPct).toBe(8);
  });

  it("sin peldaños que rebajen no hay escalera que mostrar", () => {
    expect(buildLadder(12000, [])).toEqual([]);
    expect(buildLadder(12000, [{ minQuantity: 5, unitPrice: 13000 }])).toEqual([]);
  });
});

describe("validateTiers", () => {
  it("acepta una escalera que baja de precio en cada peldaño", () => {
    expect(validateTiers(M_LINE)).toBeNull();
    expect(validateTiers([])).toBeNull();
  });

  it("rechaza una escalera que sube de precio al llevar más", () => {
    expect(
      validateTiers([
        { minQuantity: 1, unitPrice: 10000 },
        { minQuantity: 5, unitPrice: 11000 },
      ]),
    ).toMatch(/no puede costar más/);
  });

  it("rechaza dos peldaños que empiezan en la misma cantidad", () => {
    expect(
      validateTiers([
        { minQuantity: 5, unitPrice: 10000 },
        { minQuantity: 5, unitPrice: 9000 },
      ]),
    ).toMatch(/dos peldaños/);
  });

  it("rechaza cantidades que no son enteros de al menos 1", () => {
    expect(validateTiers([{ minQuantity: 0, unitPrice: 9000 }])).toMatch(/entera/);
    expect(validateTiers([{ minQuantity: 2.5, unitPrice: 9000 }])).toMatch(/entera/);
  });
});

/**
 * Los feeds publican **el precio de una unidad**. Una escalera por cantidad no
 * se puede representar en Google Merchant, Meta ni Mercado Libre: si un feed
 * exportara el precio del peldaño más alto, anunciaría un precio que nadie
 * puede pagar comprando una sola.
 *
 * Se comprueba por importación en vez de por el número: un feed que ni siquiera
 * conoce la escalera no puede publicarla por accidente.
 */
describe("los feeds publican el precio de una unidad", () => {
  const FEEDS = [
    "lib/google-merchant.ts",
    "lib/meta-catalog-feed.ts",
    "lib/mercadolibre/listings.ts",
  ];

  it.each(FEEDS)("%s no resuelve precios por cantidad", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toContain("price-tiers");
    expect(source).not.toContain("product-pricing");
    expect(source).not.toContain("priceTiers");
  });
});
