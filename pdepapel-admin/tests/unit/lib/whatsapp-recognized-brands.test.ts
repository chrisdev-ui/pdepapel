import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import {
  isRecognizedBrand,
  recognizedBrandInName,
  recognizedBrandSource,
} from "@/lib/whatsapp/recognized-brands";

describe("marcas reconocidas", () => {
  it("cuenta por el campo de marca y por la marca madre de una línea", () => {
    expect(isRecognizedBrand({ name: "Norma" })).toBe(true);
    expect(isRecognizedBrand({ name: "Flower Power", parent: { name: "Primavera" } })).toBe(true);
    expect(isRecognizedBrand({ name: "Gipao" })).toBe(true);
    expect(isRecognizedBrand({ name: "Rosy Posy" })).toBe(false);
  });

  it.each([
    ["Resaltador Grafi lila", "Grafi"],
    ["Marcador Sharpie fino negro", "Sharpie"],
    ["Set de colores triangulares Offi-Esco 12 colores", "Offi-Esco"],
    ["Lápiz Mirado No. 2", "Mirado"],
    ["Cuaderno Gipao tapa dura", "Gipao"],
    ["Marcador doble punta TOMBOW", "Tombow"],
  ])("«%s» la nombra (%s)", (name, marca) => {
    expect(recognizedBrandInName(name)).toBe(marca);
    expect(recognizedBrandSource({ name, brandRef: null })).toBe("name");
  });

  it("palabra entera: «normal» o «primaveral» no son Norma ni Primavera", () => {
    expect(recognizedBrandInName("Cuaderno de tapa normal")).toBeNull();
    expect(recognizedBrandInName("Libreta primaveral flores")).toBeNull();
  });

  it.each([
    "Cuaderno argollado Stitch",
    "Libreta Sanrio Kuromi",
    "Morral Hello Kitty",
    "Agenda Disney princesas",
    "Stickers Pokémon",
  ])("una licencia de personaje sola no es marca reconocida: «%s»", (name) => {
    expect(recognizedBrandSource({ name, brandRef: null })).toBeNull();
    expect(isRecognizedBrand({ name: name.split(" ").pop()! })).toBe(false);
  });

  it("las que Paula dejó fuera (calidad media) no cuentan", () => {
    for (const name of ["Rosy Posy", "Mycardcol", "Formas Futuro"]) {
      expect(recognizedBrandSource({ name: `Producto ${name}`, brandRef: { name } })).toBeNull();
    }
  });

  it("una línea reconocida cuenta también por el nombre", () => {
    expect(recognizedBrandInName("Cuaderno Flower Power rosado", ["Flower Power"])).toBe("Flower Power");
  });
});
