import { describe, expect, it } from "vitest";

import { calculatePackageDimensions } from "@/lib/package-calculator";

const caja = {
  width: 20, height: 10, length: 30,
  type: "box" as const, size: "M" as const, id: "b1", name: "M",
};

describe("un producto sin talla no impide la guía", () => {
  it("asume M-L en vez de reventar", () => {
    // El 2026-09-15 crear la guía falló con «Cannot read properties of
    // undefined (reading 'value')»: la consulta del panel no traía la relación.
    const dims = calculatePackageDimensions(
      [{ productId: "p1", quantity: 1 }],
      [{ id: "p1", name: "Sin talla" } as never],
      { M: caja },
    );
    expect(dims.weight).toBeGreaterThan(0);
    expect(dims.width).toBeGreaterThan(0);
  });

  it("con la talla en null tampoco", () => {
    const dims = calculatePackageDimensions(
      [{ productId: "p1", quantity: 1 }],
      [{ id: "p1", name: "Talla nula", size: null } as never],
      { M: caja },
    );
    expect(dims.weight).toBeGreaterThan(0);
  });

  it("si la talla existe se sigue usando", () => {
    const dims = calculatePackageDimensions(
      [{ productId: "p1", quantity: 1 }],
      [{ id: "p1", name: "Con talla", size: { name: "M", value: "M-L" } } as never],
      { M: caja },
    );
    expect(dims.weight).toBeGreaterThan(0);
  });

  it("mezclar productos con y sin talla tampoco revienta", () => {
    const dims = calculatePackageDimensions(
      [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2 }],
      [
        { id: "p1", name: "Con talla", size: { name: "S", value: "S-P" } } as never,
        { id: "p2", name: "Sin talla" } as never,
      ],
      { M: caja },
    );
    expect(dims.weight).toBeGreaterThan(0);
  });
});
