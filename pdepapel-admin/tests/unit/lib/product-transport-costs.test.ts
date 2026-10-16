import { describe, expect, it } from "vitest";

import { LEGACY_TRANSPORT_FILL, isKnownTransport, perUnitFromOrder, transportWarning } from "@/lib/product-costs";
import { needsTransportReview, productMatchesView } from "@/lib/product-readiness";

describe("envío por unidad", () => {
  it("«Toda la orden»: el envío de la compra entre las unidades, a dos decimales; sin datos válidos, nada", () => {
    expect(perUnitFromOrder(1000, 100)).toBe(10);
    expect(perUnitFromOrder(1000, 3)).toBe(333.33);
    expect(perUnitFromOrder(0, 10)).toBe(0);
    expect(perUnitFromOrder(1000, 0)).toBeNull();
    expect(perUnitFromOrder(1000, 2.5)).toBeNull();
    expect(perUnitFromOrder(null, 10)).toBeNull();
    expect(perUnitFromOrder(-5, 10)).toBeNull();
  });

  it("avisa cuando parece el envío de toda una orden: igual o mayor que la compra, o más del 25 % del precio", () => {
    expect(transportWarning({ transport: 1000, acqPrice: 162, price: 500 })).toContain("igual o mayor que el costo de compra");
    expect(transportWarning({ transport: 3000, acqPrice: 9000, price: 10000 })).toContain("pasa del 25 % del precio");
    expect(transportWarning({ transport: 10, acqPrice: 162, price: 500 })).toBeNull();
    expect(transportWarning({ transport: null, acqPrice: 162, price: 500 })).toBeNull();
    expect(transportWarning({ transport: 0, acqPrice: 162, price: 500 })).toBeNull();
  });

  it("el 1.000 del relleno y el vacío no son datos; cualquier otro valor sí", () => {
    expect(LEGACY_TRANSPORT_FILL).toBe(1000);
    expect(isKnownTransport(1000)).toBe(false);
    expect(isKnownTransport(null)).toBe(false);
    expect(isKnownTransport(undefined)).toBe(false);
    expect(isKnownTransport(0)).toBe(true);
    expect(isKnownTransport(999.5)).toBe(true);
  });

  it("«Transporte por revisar»: activos con el 1.000 del relleno o con un envío que parece de orden; nunca archivados", () => {
    const base = { isArchived: false, stock: 5, price: 20000, acqPrice: 9000 };
    expect(needsTransportReview({ transportationCost: 1000, acqPrice: 9000, price: 20000 })).toBe(true);
    expect(productMatchesView({ ...base, transportationCost: 1000 }, "transporte-por-revisar")).toBe(true);
    expect(productMatchesView({ ...base, transportationCost: 9500 }, "transporte-por-revisar")).toBe(true);
    expect(productMatchesView({ ...base, transportationCost: 300 }, "transporte-por-revisar")).toBe(false);
    expect(productMatchesView({ ...base, transportationCost: null }, "transporte-por-revisar")).toBe(false);
    expect(productMatchesView({ ...base, isArchived: true, transportationCost: 1000 }, "transporte-por-revisar")).toBe(false);
  });
});
