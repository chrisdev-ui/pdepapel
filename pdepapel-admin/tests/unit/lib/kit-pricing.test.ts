import {
  computeKitStockLimit,
  sumKitComponentCost,
  sumKitComponentRetail,
  suggestKitPrice,
} from "@/lib/kit-pricing";
import { describe, expect, it } from "vitest";

const components = [
  { quantity: 2, price: 9000, acqPrice: 3000 },
  { quantity: 1, price: 14000, acqPrice: 4000 },
];

describe("precio de un kit", () => {
  it("el costo del kit es el de sus componentes", () => {
    // 2 x 3.000 + 1 x 4.000
    expect(sumKitComponentCost(components)).toBe(10000);
  });

  it("suma lo que costarían los componentes por separado", () => {
    expect(sumKitComponentRetail(components)).toBe(32000);
  });

  it("sugiere el precio con el descuento de kit", () => {
    expect(suggestKitPrice(components, 0)).toBe(32000);
    expect(suggestKitPrice(components, 15)).toBe(27200);
  });

  it("acota el descuento a un rango válido", () => {
    expect(suggestKitPrice(components, -10)).toBe(32000);
    expect(suggestKitPrice(components, 500)).toBe(0);
  });

  it("un kit sin componentes no cuesta ni sugiere nada", () => {
    expect(sumKitComponentCost([])).toBe(0);
    expect(suggestKitPrice([], 20)).toBe(0);
  });
});

describe("stock derivado de un kit", () => {
  it("lo limita el componente que menos alcanza", () => {
    const limit = computeKitStockLimit([
      { quantity: 2, stock: 10, name: "Libreta" },
      { quantity: 3, stock: 6, name: "Washi tape" },
      { quantity: 1, stock: 28, name: "Notas" },
    ]);
    // 10/2 = 5, 6/3 = 2, 28/1 = 28 -> se pueden armar 2
    expect(limit?.units).toBe(2);
    expect(limit?.binding?.name).toBe("Washi tape");
  });

  it("un componente agotado deja el kit en cero", () => {
    const limit = computeKitStockLimit([{ quantity: 1, stock: 0 }]);
    expect(limit?.units).toBe(0);
  });

  it("sin componentes no hay stock que derivar", () => {
    expect(computeKitStockLimit([])).toBeNull();
  });
});
