import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { isSameCartWeight } from "@/lib/shipping-helpers";

describe("¿es el mismo carrito?", () => {
  it("el ajuste de la transportadora no cuenta como carrito distinto", () => {
    // La transportadora redondea: 1,00 kg calculado puede volver como 1,05.
    expect(isSameCartWeight(1.05, 1.0)).toBe(true);
    expect(isSameCartWeight(1.0, 1.0)).toBe(true);
    expect(isSameCartWeight(2.0, 1.9)).toBe(true);
  });

  it("añadir o quitar algo sí cambia el carrito", () => {
    // Un artículo más pesa mucho más que un redondeo.
    expect(isSameCartWeight(1.0, 1.5)).toBe(false);
    expect(isSameCartWeight(1.0, 2.0)).toBe(false);
    expect(isSameCartWeight(3.0, 1.0)).toBe(false);
  });

  it("justo en el borde del 10 %", () => {
    expect(isSameCartWeight(1.0, 0.9)).toBe(true);
    expect(isSameCartWeight(1.0, 0.89)).toBe(false);
  });

  it("un peso que no existe nunca se reaprovecha", () => {
    expect(isSameCartWeight(0, 1)).toBe(false);
    expect(isSameCartWeight(1, 0)).toBe(false);
    expect(isSameCartWeight(-1, 1)).toBe(false);
  });
});
