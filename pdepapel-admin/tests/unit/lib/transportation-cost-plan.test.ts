import { describe, expect, it } from "vitest";

import { UNTRUSTED_SHIPPING, buildTransportWrites, listingImpact, planRow, proposedTransport, transportGroup, type PlanProduct } from "@/lib/transportation-cost-plan";

const before = new Date("2026-08-01T00:00:00Z");
const formWeek = new Date("2026-09-15T00:00:00Z");
const after = new Date("2026-10-01T00:00:00Z");

const product = (overrides: Partial<PlanProduct> = {}): PlanProduct => ({
  id: "p1",
  sku: "SKU-1",
  name: "Sobre Prueba",
  price: 480,
  acqPrice: 160,
  transportationCost: 1000,
  stock: 90,
  reservedUnits: 0,
  createdAt: before,
  isArchived: false,
  isKit: false,
  averagedAfterBackfill: false,
  convertedVariant: false,
  lastReceipt: null,
  ...overrides,
});

describe("corrección del envío por unidad", () => {
  it("agrupa por cuándo se creó: relleno, semana del formulario, después; y los promediados", () => {
    expect(transportGroup({ createdAt: before, transportationCost: 1000, averagedAfterBackfill: false })).toBe("a-relleno");
    expect(transportGroup({ createdAt: formWeek, transportationCost: 1000, averagedAfterBackfill: false })).toBe("b1-formulario");
    expect(transportGroup({ createdAt: after, transportationCost: 1000, averagedAfterBackfill: false })).toBe("b2-despues");
    expect(transportGroup({ createdAt: before, transportationCost: 642.5, averagedAfterBackfill: true })).toBe("d-promediado");
    expect(transportGroup({ createdAt: before, transportationCost: 642.5, averagedAfterBackfill: false })).toBeNull();
    expect(transportGroup({ createdAt: before, transportationCost: null, averagedAfterBackfill: true })).toBeNull();
    expect(transportGroup({ createdAt: before, transportationCost: 0, averagedAfterBackfill: true })).toBeNull();
  });

  it("el valor nuevo es el envío real de la última recepción, repartido como la recepción; sin recepción, no registrado", () => {
    expect(proposedTransport(null)).toBeNull();
    expect(proposedTransport({ kind: "recepcion", orderNumber: "PO-0004", at: after, unitCost: 160, landedUnitCost: 170.13 })).toBe(10.13);
    // Pedido de 100 × 160 = 16.000 con 1.000 de envío: 1.000 / 16.000 × 160 = 10 por unidad.
    expect(proposedTransport({ kind: "pedido", orderNumber: "PO-0004", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 1000 })).toBe(10);
    expect(proposedTransport({ kind: "pedido", orderNumber: "PO-1", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 0 })).toBe(0);
  });

  it("un producto barato con el 1.000: de 1.160 a 170 por unidad; que el margen suba no es excepción, se aplica con la regla", () => {
    const row = planRow(product({ lastReceipt: { kind: "pedido", orderNumber: "PO-0004", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 1000 } }))!;
    expect(row).toMatchObject({ grupo: "a-relleno", archivado: false, expectedTransport: 1000, newTransport: 10, costBefore: 1160, costAfter: 170, available: 90, exceptions: [], aprobado: true });
  });

  it("excepciones para Paula: copiado después del 18 de septiembre, promediado, envío real > 25 % del precio, sigue bajo costo, el margen baja", () => {
    expect(planRow(product({ createdAt: after, convertedVariant: true }))!.exceptions).toEqual(["1.000 copiado al convertir en variantes"]);
    expect(planRow(product({ createdAt: after }))!.exceptions).toEqual(["1.000 después del 18 de septiembre: copiado al duplicar o escrito a mano"]);
    const averaged = planRow(product({ transportationCost: 640.5, averagedAfterBackfill: true, price: 9000, acqPrice: 4000, lastReceipt: { kind: "recepcion", orderNumber: "PO-2", at: after, unitCost: 4000, landedUnitCost: 4200 } }))!;
    expect(averaged.exceptions).toEqual(["el valor salió de promediar una recepción con el 1.000"]);
    const expensiveShipping = planRow(product({ price: 1000, acqPrice: 300, lastReceipt: { kind: "recepcion", orderNumber: "PO-9", at: after, unitCost: 300, landedUnitCost: 600 } }))!;
    expect(expensiveShipping.exceptions).toEqual(["el envío real por unidad pasa del 25 % del precio"]);
    const stillBelow = planRow(product({ price: 150 }))!;
    expect(stillBelow.exceptions).toEqual(["sigue por debajo del costo después de corregir"]);
    const higher = planRow(product({ price: 50000, acqPrice: 20000, lastReceipt: { kind: "recepcion", orderNumber: "PO-7", at: after, unitCost: 20000, landedUnitCost: 21500 } }))!;
    expect(higher.exceptions).toEqual(["el margen baja: el envío real pasa de lo que tenía"]);
    const quiet = planRow(product({ price: 20000, acqPrice: 9000 }))!;
    expect(quiet).toMatchObject({ newTransport: null, source: "sin recepción: no registrado", exceptions: [], aprobado: true });
  });

  it("recepción vieja: lo que guardó su movimiento manda sobre lo recalculado del pedido", () => {
    const order = { kind: "pedido" as const, orderNumber: "PO-5", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 1000 };
    // Coincide (10 calculado, 10 guardado): se queda.
    expect(planRow(product({ price: 20000, lastReceipt: order, storedShare: 10.2 }))).toMatchObject({ newTransport: 10, aprobado: true, source: "pedido PO-5 (2026-10-01)" });
    // Guardó otro valor real: manda lo guardado.
    expect(planRow(product({ price: 20000, lastReceipt: order, storedShare: 25 }))).toMatchObject({ newTransport: 25, aprobado: true, source: "lo guardado en la recepción del pedido PO-5 (2026-10-01)" });
    // Guardó 0 y el pedido dice envío: sin dato confiable, null, para Paula.
    const untrusted = planRow(product({ price: 20000, lastReceipt: order, storedShare: 0 }))!;
    expect(untrusted).toMatchObject({ newTransport: null, aprobado: false });
    expect(untrusted.exceptions).toEqual([UNTRUSTED_SHIPPING]);
    // Sin movimiento guardado: lo recalculado, como lo reparte la recepción.
    expect(planRow(product({ price: 20000, lastReceipt: order, storedShare: null }))).toMatchObject({ newTransport: 10, aprobado: true });
  });

  it("kits: su envío propio queda null sin revisión, aunque el costo de sus piezas los deje bajo costo", () => {
    const kit = planRow(product({ isKit: true, price: 150, lastReceipt: { kind: "pedido", orderNumber: "PO-1", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 1000 } }))!;
    expect(kit).toMatchObject({ newTransport: null, exceptions: [], aprobado: true, source: "kit: su costo es el de sus piezas" });
  });

  it("archivados: misma regla y sin revisión, aunque tengan algo que en uno activo sería excepción", () => {
    const archived = planRow(product({ isArchived: true, createdAt: after, price: 150 }))!;
    expect(archived).toMatchObject({ archivado: true, grupo: "b2-despues", exceptions: [], aprobado: true, newTransport: null });
  });

  it("sin cambio no hay fila; un valor normal sin promedio tampoco", () => {
    expect(planRow(product({ transportationCost: 10, averagedAfterBackfill: true, lastReceipt: { kind: "pedido", orderNumber: "PO-1", at: after, unitCost: 160, totalAmount: 16000, shippingCost: 1000 } }))).toBeNull();
    expect(planRow(product({ transportationCost: 300 }))).toBeNull();
  });

  it("Mercado Libre: piso de costo y punto de equilibrio estimado antes y después; en venta por debajo del piso nuevo; pérdida autorizada que ya no hace falta", () => {
    const row = { acqPrice: 160, expectedTransport: 1000, newTransport: 10 };
    const impact = listingImpact({ id: "l1", productId: "p1", status: "ACTIVE", price: 900, hasBelowCostOverride: true }, row);
    expect(impact).toMatchObject({ costFloorBefore: 1160, costFloorAfter: 170, liveBelowNewFloor: false, overrideNoLongerNeeded: true });
    expect(impact.breakevenAfter!).toBeLessThan(impact.breakevenBefore!);
    const higher = listingImpact({ id: "l2", productId: "p2", status: "ACTIVE", price: 1500, hasBelowCostOverride: false }, { acqPrice: 1200, expectedTransport: 1000, newTransport: 1400 });
    expect(higher.liveBelowNewFloor).toBe(true);
    const paused = listingImpact({ id: "l3", productId: "p2", status: "PAUSED", price: 1500, hasBelowCostOverride: false }, { acqPrice: 1200, expectedTransport: 1000, newTransport: 1400 });
    expect(paused.liveBelowNewFloor).toBe(false);
    expect(listingImpact({ id: "l4", productId: "p3", status: "ACTIVE", price: 900, hasBelowCostOverride: false }, { acqPrice: null, expectedTransport: 1000, newTransport: null })).toMatchObject({ costFloorBefore: null, costFloorAfter: null, breakevenAfter: null });
  });

  it("lo que se escribe: la regla (activos y archivados) y solo las excepciones que Paula marcó", () => {
    const { writes, counts } = buildTransportWrites(
      [
        { id: "a", archivado: false, expectedTransport: 1000, newTransport: 10 },
        { id: "b", archivado: true, expectedTransport: 1000, newTransport: null },
      ],
      [
        { id: "c", expectedTransport: 1000, newTransport: 2000, decision: "aplicar" },
        { id: "d", expectedTransport: 1000, newTransport: 1500, decision: "otro valor", otroValor: 120 },
        { id: "e", expectedTransport: 1000, newTransport: 50, decision: "dejar" },
        { id: "g", expectedTransport: 1000, newTransport: 4561, decision: "no registrado" },
        { id: "f", expectedTransport: 1000, newTransport: 50, decision: "pendiente" },
      ],
    );
    expect(writes).toEqual([
      { id: "a", expected: 1000, value: 10 },
      { id: "b", expected: 1000, value: null },
      { id: "c", expected: 1000, value: 2000 },
      { id: "d", expected: 1000, value: 120 },
      { id: "g", expected: 1000, value: null },
    ]);
    expect(counts).toEqual({ reglaActivos: 1, reglaArchivados: 1, excepcionesAplicar: 1, excepcionesOtroValor: 1, excepcionesNoRegistrado: 1, excepcionesDejar: 1, excepcionesPendientes: 1 });
  });

  it("un id repetido, un valor inválido o «otro valor» sin número detienen todo", () => {
    expect(() => buildTransportWrites([{ id: "a", archivado: false, expectedTransport: 1000, newTransport: 10 }], [{ id: "a", expectedTransport: 1000, newTransport: 20, decision: "aplicar" }])).toThrow("dos veces");
    expect(() => buildTransportWrites([{ id: "a", archivado: false, expectedTransport: 1000, newTransport: -1 }])).toThrow("valor inválido");
    expect(() => buildTransportWrites([], [{ id: "a", expectedTransport: 1000, newTransport: 20, decision: "otro valor" }])).toThrow("sin número");
    expect(buildTransportWrites([{ id: "a", archivado: false, expectedTransport: 10, newTransport: 10 }]).writes).toEqual([]);
  });
});

