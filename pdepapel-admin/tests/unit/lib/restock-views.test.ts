import { RestockOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESTOCK_VIEW,
  expectedArrival,
  isRestockView,
  restockMatchesView,
  summarizeRestockOrders,
  type RestockRowInput,
} from "@/lib/restock-views";

const day = (iso: string) => new Date(`${iso}T12:00:00`);

const row = (overrides: Partial<RestockRowInput> = {}): RestockRowInput => ({
  status: RestockOrderStatus.ORDERED,
  createdAt: day("2026-09-01"),
  totalAmount: 100_000,
  shippingCost: 10_000,
  progress: { remainingUnits: 12 },
  supplierLeadTimeDays: 10,
  ...overrides,
});

describe("vistas de aprovisionamiento", () => {
  it("reconoce las vistas válidas y descarta cualquier otra cosa de la URL", () => {
    expect(isRestockView("recibiendo")).toBe(true);
    expect(isRestockView("inventado")).toBe(false);
    expect(isRestockView(null)).toBe(false);
    expect(DEFAULT_RESTOCK_VIEW).toBe("todo");
  });

  it("manda cada estado a su vista, y todos a «Todo»", () => {
    const statuses = [
      RestockOrderStatus.DRAFT,
      RestockOrderStatus.ORDERED,
      RestockOrderStatus.PARTIALLY_RECEIVED,
      RestockOrderStatus.COMPLETED,
      RestockOrderStatus.CANCELLED,
    ];
    expect(statuses.map((status) => restockMatchesView({ status }, "todo"))).toEqual([true, true, true, true, true]);
    expect(statuses.map((status) => restockMatchesView({ status }, "borradores"))).toEqual([true, false, false, false, false]);
    expect(statuses.map((status) => restockMatchesView({ status }, "al-proveedor"))).toEqual([false, true, false, false, false]);
    expect(statuses.map((status) => restockMatchesView({ status }, "recibiendo"))).toEqual([false, false, true, false, false]);
    expect(statuses.map((status) => restockMatchesView({ status }, "completados"))).toEqual([false, false, false, true, false]);
    expect(statuses.map((status) => restockMatchesView({ status }, "cancelados"))).toEqual([false, false, false, false, true]);
  });
});

describe("cuándo llega", () => {
  it("no inventa una fecha cuando el proveedor no tiene plazo registrado", () => {
    // Hoy 28 de 29 proveedores están así: la lista lo dice en vez de estimar.
    expect(expectedArrival(row({ supplierLeadTimeDays: null }), day("2026-09-20"))).toEqual({
      state: "sin-plazo",
      date: null,
      overdueDays: 0,
    });
    expect(expectedArrival(row({ supplierLeadTimeDays: undefined }), day("2026-09-20")).state).toBe("sin-plazo");
    expect(expectedArrival(row({ supplierLeadTimeDays: -3 }), day("2026-09-20")).state).toBe("sin-plazo");
  });

  it("no espera nada de un borrador ni de un pedido cerrado", () => {
    expect(expectedArrival(row({ status: RestockOrderStatus.DRAFT }), day("2026-09-20")).state).toBe("sin-pedir");
    expect(expectedArrival(row({ status: RestockOrderStatus.COMPLETED }), day("2026-09-20")).state).toBe("cerrado");
    expect(expectedArrival(row({ status: RestockOrderStatus.CANCELLED }), day("2026-09-20")).state).toBe("cerrado");
  });

  it("suma el plazo a la fecha del pedido y clasifica el día", () => {
    // Pedido el 1 con 10 días de plazo: llega el 11.
    const arrival = expectedArrival(row(), day("2026-09-05"));
    expect(arrival.state).toBe("en-plazo");
    expect(arrival.date?.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(expectedArrival(row(), day("2026-09-11")).state).toBe("hoy");
  });

  it("cuenta los días de retraso cuando ya pasó el plazo", () => {
    const late = expectedArrival(row(), day("2026-09-20"));
    expect(late.state).toBe("retrasado");
    expect(late.overdueDays).toBe(9);
  });

  it("compara por día, no por hora, así una entrega de hoy no sale retrasada", () => {
    const madeAt = new Date("2026-09-01T23:30:00");
    const arrival = expectedArrival(row({ createdAt: madeAt, supplierLeadTimeDays: 3 }), new Date("2026-09-04T07:00:00"));
    expect(arrival.state).toBe("hoy");
    expect(arrival.overdueDays).toBe(0);
  });
});

describe("resumen de cabecera", () => {
  const now = day("2026-09-20");
  const rows: RestockRowInput[] = [
    row({ status: RestockOrderStatus.DRAFT, progress: { remainingUnits: 40 }, totalAmount: 500_000 }),
    row({ status: RestockOrderStatus.ORDERED, progress: { remainingUnits: 12 }, totalAmount: 100_000, shippingCost: 10_000 }),
    row({ status: RestockOrderStatus.PARTIALLY_RECEIVED, progress: { remainingUnits: 5 }, totalAmount: 60_000, shippingCost: 0, supplierLeadTimeDays: 60 }),
    row({ status: RestockOrderStatus.COMPLETED, progress: { remainingUnits: 0 }, totalAmount: 900_000 }),
    row({ status: RestockOrderStatus.CANCELLED, progress: { remainingUnits: 7 }, totalAmount: 30_000 }),
    row({ status: RestockOrderStatus.ORDERED, progress: { remainingUnits: 3 }, totalAmount: 20_000, shippingCost: 0, supplierLeadTimeDays: null }),
  ];

  it("cuenta solo lo abierto en las tarjetas", () => {
    const totals = summarizeRestockOrders(rows, { now });
    // Abiertos: los dos ORDERED y el PARTIALLY_RECEIVED.
    expect(totals.waiting).toBe(3);
    expect(totals.unitsInTransit).toBe(12 + 5 + 3);
    expect(totals.committed).toBe(110_000 + 60_000 + 20_000);
    // Solo el ORDERED del 1 de septiembre con 10 días de plazo pasó la fecha:
    // el de 60 días sigue en plazo y el que no tiene plazo no se juzga.
    expect(totals.overdue).toBe(1);
  });

  it("cuenta cada pedido en su pestaña", () => {
    const totals = summarizeRestockOrders(rows, { now });
    expect(totals.byView).toEqual({
      todo: 6,
      borradores: 1,
      "al-proveedor": 2,
      recibiendo: 1,
      completados: 1,
      cancelados: 1,
    });
  });

  it("devuelve ceros sin pedidos", () => {
    const totals = summarizeRestockOrders([], { now });
    expect(totals).toMatchObject({ waiting: 0, unitsInTransit: 0, committed: 0, overdue: 0 });
    expect(totals.byView.todo).toBe(0);
  });
});
