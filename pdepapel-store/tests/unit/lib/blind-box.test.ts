import { describe, expect, it } from "vitest";

import { blindBoxFloor, isBlindBox } from "@/lib/blind-box";
import type { Product } from "@/types";

const inCategory = (slug: string) =>
  ({ category: { id: "x", name: "n", slug } }) as unknown as Product;

/**
 * El aviso de caja sorpresa se decide por la categoría, así que una categoría
 * mal puesta se convierte en una mentira en la ficha. Pasó: cuatro «Kit
 * oficina» estaban en «Kits sorpresa» y la tienda les habría dicho al
 * comprador que no podía escoger, cuando el color es justo lo que escoge.
 */
describe("isBlindBox", () => {
  it("marca lo que está en «Kits sorpresa»", () => {
    expect(isBlindBox(inCategory("kits-sorpresa"))).toBe(true);
  });

  it("NO marca los kits de oficina, donde el comprador sí escoge el color", () => {
    expect(isBlindBox(inCategory("kits-de-oficina"))).toBe(false);
  });

  it("no marca ninguna otra categoría de kits", () => {
    for (const slug of ["kits-escolares", "kits-kawaii", "kits-universitarios", "kits-de-lectura", "agendas"]) {
      expect(isBlindBox(inCategory(slug))).toBe(false);
    }
  });

  it("un producto sin categoría no se marca", () => {
    expect(isBlindBox({} as unknown as Product)).toBe(false);
  });
});

describe("blindBoxFloor", () => {
  it("promete artículos, no un artículo concreto", () => {
    expect(blindBoxFloor(1)).toBe("1 artículo sorpresa");
    expect(blindBoxFloor(5)).toBe("5 artículos sorpresa");
  });

  it("nunca promete menos de uno", () => {
    expect(blindBoxFloor(0)).toBe("1 artículo sorpresa");
    expect(blindBoxFloor(-3)).toBe("1 artículo sorpresa");
  });
});
