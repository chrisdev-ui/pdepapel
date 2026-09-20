import { describe, expect, it } from "vitest";

import { collectFairAnchors, describeFairSale, FAIR_KARDEX_TYPES } from "@/lib/fair-kardex";

const at = (iso: string) => new Date(iso);
const mv = (type: string, referenceId: string | null, iso: string) =>
  ({ type, referenceId, createdAt: at(iso) }) as Parameters<typeof collectFairAnchors>[0][number];

describe("ferias en el kardex", () => {
  it("solo mira la reserva y el retorno", () => {
    expect(Array.from(FAIR_KARDEX_TYPES).sort()).toEqual(["FESTIVAL_ALLOCATION", "FESTIVAL_RETURN"]);
    const anchors = collectFairAnchors([mv("ORDER_PLACED", "o1", "2026-09-01T10:00:00Z")]);
    expect(anchors.size).toBe(0);
  });

  it("una feria cerrada se ancla en su retorno, no en la reserva", () => {
    const anchors = collectFairAnchors([
      mv("FESTIVAL_ALLOCATION", "f1", "2026-09-01T10:00:00Z"),
      mv("FESTIVAL_RETURN", "f1", "2026-09-05T18:00:00Z"),
    ]);
    const anchor = anchors.get("f1")!;
    expect(anchor.closed).toBe(true);
    expect(anchor.settledAt.toISOString()).toBe("2026-09-05T18:00:00.000Z");
  });

  it("una feria sin cerrar se ancla en su reserva más reciente", () => {
    const anchors = collectFairAnchors([
      mv("FESTIVAL_ALLOCATION", "f1", "2026-09-01T10:00:00Z"),
      mv("FESTIVAL_ALLOCATION", "f1", "2026-09-03T09:00:00Z"),
    ]);
    const anchor = anchors.get("f1")!;
    expect(anchor.closed).toBe(false);
    expect(anchor.settledAt.toISOString()).toBe("2026-09-03T09:00:00.000Z");
  });

  it("separa varias ferias y salta las filas sin referencia", () => {
    const anchors = collectFairAnchors([
      mv("FESTIVAL_ALLOCATION", "f1", "2026-09-01T10:00:00Z"),
      mv("FESTIVAL_ALLOCATION", "f2", "2026-09-02T10:00:00Z"),
      mv("FESTIVAL_RETURN", null, "2026-09-06T10:00:00Z"),
    ]);
    expect(Array.from(anchors.keys()).sort()).toEqual(["f1", "f2"]);
  });

  it("describe lo vendido y lo que no volvió al stock", () => {
    // `reservado − devuelto` incluye lo dañado y lo perdido: por eso la cifra
    // de ventas sale de la feria y no de esa resta.
    expect(describeFairSale({ sold: 24, damaged: 3, lost: 1 })).toBe("24 unidades vendidas · 3 dañadas · 1 perdida");
    expect(describeFairSale({ sold: 1, damaged: 0, lost: 0 })).toBe("1 unidad vendida");
    expect(describeFairSale({ sold: 5, damaged: 1, lost: 0 })).toBe("5 unidades vendidas · 1 dañada");
  });
});
