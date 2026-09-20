import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOVEMENT_VIEW,
  describeAdjustmentMix,
  isMovementView,
  MOVEMENT_VIEWS,
  movementMatchesView,
  summarizeMovements,
} from "@/lib/movement-views";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-19T12:00:00.000Z");
const row = (type: string, quantity: number, iso = "2026-09-18T12:00:00.000Z") =>
  ({ type, quantity, createdAt: at(iso) }) as Parameters<typeof movementMatchesView>[0];

describe("vistas de movimientos", () => {
  it("la vista por defecto no lleva parámetro en la URL", () => {
    expect(DEFAULT_MOVEMENT_VIEW).toBe("todo");
    expect(MOVEMENT_VIEWS[0].id).toBe("todo");
  });

  it("reconoce solo los ids reales", () => {
    expect(isMovementView("ventas")).toBe(true);
    expect(isMovementView("ajustes")).toBe(true);
    expect(isMovementView("inventado")).toBe(false);
    expect(isMovementView(null)).toBe(false);
  });

  it("clasifica cada tipo donde una persona lo buscaría", () => {
    expect(movementMatchesView(row("ORDER_PLACED", -2), "ventas")).toBe(true);
    expect(movementMatchesView(row("IN_PERSON_SALE", -1), "ventas")).toBe(true);
    expect(movementMatchesView(row("RESTOCK_RECEIVED", 24), "entradas")).toBe(true);
    expect(movementMatchesView(row("ORDER_CANCELLED", 2), "entradas")).toBe(true);
    expect(movementMatchesView(row("DAMAGE", -1), "ajustes")).toBe(true);
    expect(movementMatchesView(row("MANUAL_ADJUSTMENT", 3), "ajustes")).toBe(true);
    expect(movementMatchesView(row("FESTIVAL_ALLOCATION", -30), "ferias")).toBe(true);
    expect(movementMatchesView(row("FESTIVAL_RETURN", 6), "ferias")).toBe(true);
  });

  it("una venta no aparece en entradas ni en ajustes", () => {
    expect(movementMatchesView(row("ORDER_PLACED", -2), "entradas")).toBe(false);
    expect(movementMatchesView(row("ORDER_PLACED", -2), "ajustes")).toBe(false);
  });

  it("«todo» incluye hasta la conversión a variantes, que no tiene vista propia", () => {
    const conversion = row("VARIANT_CONVERSION", -4);
    expect(movementMatchesView(conversion, "todo")).toBe(true);
    for (const view of ["ventas", "entradas", "ajustes", "ferias"] as const) {
      expect(movementMatchesView(conversion, view)).toBe(false);
    }
  });

  it("«pendientes» no son movimientos: su pestaña muestra las incidencias", () => {
    expect(movementMatchesView(row("ORDER_PLACED", -2), "pendientes")).toBe(false);
  });
});

describe("resumen de cabecera", () => {
  const rows = [
    row("RESTOCK_RECEIVED", 24),
    row("ORDER_PLACED", -2),
    row("IN_PERSON_SALE", -1),
    row("MANUAL_ADJUSTMENT", 3),
    row("DAMAGE", -1),
    row("LOST", -2),
    // Fuera de la ventana de 30 días: cuenta para la pestaña, no para la tarjeta.
    row("RESTOCK_RECEIVED", 100, "2026-05-01T12:00:00.000Z"),
  ];

  it("suma entradas y salidas solo dentro de la ventana", () => {
    const totals = summarizeMovements(rows, { now: NOW });
    expect(totals.entries).toBe(27);
    expect(totals.exits).toBe(6);
  });

  it("el saldo de ajustes puede ser negativo y trae su desglose", () => {
    const totals = summarizeMovements(rows, { now: NOW });
    expect(totals.adjustments).toBe(0);
    expect(totals.adjustmentCounts).toEqual({ adjustments: 1, damage: 1, lost: 1 });
  });

  it("cuenta las filas de cada pestaña sobre todo lo cargado", () => {
    const totals = summarizeMovements(rows, { now: NOW, pending: 20 });
    expect(totals.byView.todo).toBe(7);
    expect(totals.byView.ventas).toBe(2);
    expect(totals.byView.entradas).toBe(2);
    expect(totals.byView.ajustes).toBe(3);
    expect(totals.byView.ferias).toBe(0);
    // Las incidencias vienen contadas aparte: no son movimientos.
    expect(totals.byView.pendientes).toBe(20);
  });

  it("describe la mezcla de ajustes en español, saltando lo que esté en cero", () => {
    expect(describeAdjustmentMix({ adjustments: 18, damage: 3, lost: 1 })).toBe("18 ajustes · 3 daños · 1 pérdida");
    expect(describeAdjustmentMix({ adjustments: 1, damage: 0, lost: 0 })).toBe("1 ajuste");
    expect(describeAdjustmentMix({ adjustments: 0, damage: 0, lost: 0 })).toBe("Sin ajustes en el periodo");
  });
});
