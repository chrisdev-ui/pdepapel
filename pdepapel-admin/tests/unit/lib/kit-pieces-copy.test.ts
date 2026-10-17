import { describe, expect, it } from "vitest";

import { checkPiecesCopy, describesPieces, piecesPurposeBullet } from "@/lib/copiloto/skills/kit-pieces-copy";

const KIT = [
  { nombre: "Libreta argollada Prueba", categoria: "Cuadernos" },
  { nombre: "Lapicero gel Prueba x2", categoria: "Escritura" },
  { nombre: "Cinta correctora Prueba", categoria: "Útiles" },
];

describe("las frases de «Lo que amarás» hablan de las piezas del kit", () => {
  it("acepta frases que nombran las piezas por su tipo y para qué sirven", () => {
    expect(describesPieces(["La libreta para tus apuntes y los lapiceros que combinan", "La cinta correctora para que todo quede impecable"], KIT)).toBe(true);
  });

  it("rechaza el relleno genérico que no nombra ninguna pieza", () => {
    expect(describesPieces(["Algo bonito para cada día", "Todo lo que necesitas en un solo kit"], KIT)).toBe(false);
    expect(checkPiecesCopy(["Algo bonito"], KIT).piezasNombradas).toBe(0);
  });

  it("rechaza una sola pieza nombrada cuando el kit trae más", () => {
    expect(describesPieces(["La libreta para tus apuntes", "Perfecta para el día a día"], KIT)).toBe(false);
  });

  it("rechaza piezas, personajes o marcas que el kit no trae", () => {
    expect(checkPiecesCopy(["La libreta y las tijeras para recortar", "El lapicero para escribir"], KIT).inventado).toEqual(["tijera"]);
    expect(describesPieces(["La libreta de Snoopy para tus apuntes", "El lapicero para escribir"], KIT)).toBe(false);
  });

  it("acepta un nombre propio que viene en el nombre de la pieza y las fechas del año", () => {
    const snoopy = [{ nombre: "Libreta Snoopy Prueba", categoria: "Cuadernos" }, { nombre: "Borrador", categoria: null }];
    expect(describesPieces(["La libreta de Snoopy para tus apuntes", "El borrador, listo para Navidad"], snoopy)).toBe(true);
  });

  it("el texto base nombra cada pieza por su tipo y para qué sirve", () => {
    expect(piecesPurposeBullet(KIT)).toBe("Libreta para tus notas, lapicero para escribir y cinta correctora para corregir sin tachones");
    expect(piecesPurposeBullet([{ nombre: "Cosa rara", categoria: "Varios" }])).toBeNull();
  });
});
