import { describe, expect, it } from "vitest";

import { calculateTotals, effectiveUnitPrice } from "@/lib/utils";
import type { Product } from "@/types";

/**
 * Lo que el carrito cobra tiene que ser exactamente lo que el checkout vuelve
 * a calcular en el servidor. Estas pruebas fijan los mismos números que la
 * prueba de integración del panel (`capsule-batch-flow`), con la escalera real
 * de las cápsulas: 3+ a 11.500, 5+ a 11.000, 10+ a 10.500, 15+ a 10.000.
 */
const TIERS = [
  { minQuantity: 3, unitPrice: 11500 },
  { minQuantity: 5, unitPrice: 11000 },
  { minQuantity: 10, unitPrice: 10500 },
  { minQuantity: 15, unitPrice: 10000 },
];

const capsule = (quantity: number, extra: Partial<Product> = {}): Product =>
  ({
    id: "capsula-m",
    name: "Cápsula sorpresa M",
    price: "12000",
    originalPrice: 12000,
    stock: 500,
    quantity,
    priceTiers: TIERS,
    ...extra,
  }) as unknown as Product;

describe("el carrito aplica la escalera por cantidad", () => {
  it.each([
    [1, 12000, 12000],
    [2, 12000, 24000],
    [3, 11500, 34500],
    [5, 11000, 55000],
    [9, 11000, 99000],
    [10, 10500, 105000],
    [15, 10000, 150000],
    [20, 10000, 200000],
  ])("con %i unidades cobra %i por unidad (%i en total)", (quantity, unit, total) => {
    const item = capsule(quantity);
    expect(effectiveUnitPrice(item)).toBe(unit);
    expect(calculateTotals([item], null).subtotal).toBe(total);
  });

  it("un producto sin escalera se cobra como siempre", () => {
    const plain = capsule(10, { priceTiers: undefined, originalPrice: undefined });
    expect(calculateTotals([plain], null).subtotal).toBe(120000);
  });

  it("el ahorro que se muestra incluye lo que rebaja la escalera", () => {
    const totals = calculateTotals([capsule(10)], null);
    // 10 × (12.000 − 10.500) = 15.000
    expect(totals.productSavings).toBe(15000);
  });
});

describe("una oferta y un peldaño nunca se suman", () => {
  it("gana la oferta cuando deja el precio más bajo", () => {
    // Oferta a 8.500 contra el peldaño de 10 unidades (10.500).
    const item = capsule(12, { price: "8500", originalPrice: 12000 });
    expect(effectiveUnitPrice(item)).toBe(8500);
    expect(calculateTotals([item], null).subtotal).toBe(102000);
  });

  it("gana el peldaño cuando deja el precio más bajo", () => {
    // Oferta floja a 11.500 contra el peldaño de 10 unidades (10.500).
    const item = capsule(12, { price: "11500", originalPrice: 12000 });
    expect(effectiveUnitPrice(item)).toBe(10500);
    // Encadenarlos habría dado 11.500 × 0,875 = 10.062,5 por unidad.
    expect(effectiveUnitPrice(item)).toBeGreaterThan(10062.5);
  });
});
