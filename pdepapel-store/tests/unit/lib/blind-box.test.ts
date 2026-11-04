import { describe, expect, it } from "vitest";

import { blindBoxFloor, capsulesPerUnit, isBlindBox } from "@/lib/blind-box";
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

/** Un combo x5 en el carrito con cantidad 1 son 5 sorpresas, no 1 (2026-11-03). */
describe("capsulesPerUnit", () => {
  it("lee las cápsulas del combo en el nombre", () => {
    expect(capsulesPerUnit({ name: "Cápsula sorpresa x5" })).toBe(5);
    expect(capsulesPerUnit({ name: "Cápsula sorpresa x15" })).toBe(15);
    expect(capsulesPerUnit({ name: "Cápsula sorpresa X7 " })).toBe(7);
  });

  it("sin «xN» al final cuenta como una", () => {
    expect(capsulesPerUnit({ name: "Cajita sorpresa Snoopy" })).toBe(1);
    expect(capsulesPerUnit({ name: "Pack x5 de cápsulas mini" })).toBe(1);
    expect(capsulesPerUnit({ name: "Cápsula sorpresa x0" })).toBe(1);
  });

  it("con el combo, el aviso promete tantas sorpresas como cápsulas", () => {
    expect(blindBoxFloor(1 * capsulesPerUnit({ name: "Cápsula sorpresa x5" }))).toBe("5 artículos sorpresa");
    expect(blindBoxFloor(2 * capsulesPerUnit({ name: "Cápsula sorpresa x6" }))).toBe("12 artículos sorpresa");
  });
});
