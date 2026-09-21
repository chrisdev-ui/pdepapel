import { describe, expect, it } from "vitest";

import { matchWhatsAppKeyword } from "@/lib/whatsapp/bot-matching";

/**
 * Las cuatro respuestas que hay configuradas en producción el 21 de septiembre
 * de 2026, con sus disparadores tal cual, y en el orden en que se prueban
 * (`sortOrder` ascendente). La prueba vale por lo que son de verdad: si se
 * escriben a mano bonitos, deja de probar el caso que rompía.
 */
const REALES = [
  {
    id: "impresiones",
    label: "Servicio de impresiones",
    triggers: ["imprimir un documento", "imprimir", "impresion", "impresiones", "escaner", "scanner", "scaner"],
    answer: "Claro que sí, con gusto te ayudo a imprimir.",
  },
  {
    id: "sin-servicio",
    label: "Sin servicio",
    triggers: ["fotocopias", "copias", "oficio", "hoja oficio"],
    answer: "Actualmente no tenemos servicio de fotocopias.",
  },
  {
    id: "cortesia",
    label: "Cortesía",
    triggers: ["gracias", "grax", "grasias"],
    answer: "¡Con gusto! 💛",
  },
  {
    id: "saludo",
    label: "Saludo",
    triggers: ["hola", "buenas", "buenos dias", "saludos", "ola", "oli", "holi"],
    answer: "¡Hola! 💛 Qué gusto que escribas a P de Papel.",
  },
];

const etiqueta = (frase: string) =>
  matchWhatsAppKeyword(frase, REALES)?.keyword.label ?? null;

describe("emparejado por palabras enteras", () => {
  /**
   * El fallo que motivó el cambio. En una papelería «ola» vive dentro de
   * «escolares» y «oli» dentro de «bolígrafos», así que con `includes` las dos
   * preguntas más corrientes del negocio contestaban el saludo en vez de pasar
   * al clasificador de productos.
   */
  it("no confunde un producto con un saludo", () => {
    expect(etiqueta("¿Tienen útiles escolares?")).toBeNull();
    expect(etiqueta("¿Tienen bolígrafos?")).toBeNull();
    expect(etiqueta("Necesito una cartuchera escolar")).toBeNull();
    expect(etiqueta("¿Venden cola escolar?")).toBeNull();
  });

  it("el saludo sigue saliendo cuando de verdad saludan", () => {
    for (const frase of ["Hola", "hola!", "Buenas tardes", "Buenos días", "saludos", "Holi", "¿Ola?"]) {
      expect(etiqueta(frase), frase).toBe("Saludo");
    }
  });

  /**
   * «Hoola» está en una conversación real (8ca4fdac, 21 sep). Con `includes`
   * entraba de rebote por «ola»; con palabras enteras a secas se habría caído,
   * así que la vocal estirada se aplana a propósito.
   */
  it("aguanta la vocal estirada del chat", () => {
    for (const frase of ["Hoola", "Holaa", "holaaa", "buenaas tardes"]) {
      expect(etiqueta(frase), frase).toBe("Saludo");
    }
  });

  it("no aplana consonantes dobles, que en español cambian la palabra", () => {
    // Si se aplanaran, «calle» sería «cale» y se inventarían coincidencias.
    expect(etiqueta("¿Queda en la calle 80?")).toBeNull();
    expect(etiqueta("El carro no arranca")).toBeNull();
  });

  it("los disparadores de varias palabras piden las palabras seguidas", () => {
    expect(etiqueta("¿Me puedes imprimir un documento?")).toBe("Servicio de impresiones");
    // Ojo: «imprimes» conjugado no empareja, y tampoco emparejaba antes —la
    // cadena «imprimir» nunca estuvo dentro de «imprimes»—. No es una pérdida
    // del cambio, pero sí un hueco que Paula cierra añadiendo el disparador.
    expect(etiqueta("¿Me imprimes un documento?")).toBeNull();
    expect(etiqueta("¿Tienen hoja oficio?")).toBe("Sin servicio");
    // «hoja» y «oficio» sueltas y separadas no son «hoja oficio»…
    expect(etiqueta("¿La hoja es tamaño carta o de oficio?")).toBe("Sin servicio");
  });

  it("sigue funcionando el resto de lo que ya contestaba", () => {
    expect(etiqueta("Tienes para imprimir 1 hoja en papel adhesivo?")).toBe("Servicio de impresiones");
    expect(etiqueta("¿Sacan copias?")).toBe("Sin servicio");
    expect(etiqueta("Muchas gracias!")).toBe("Cortesía");
  });

  it("gana la primera por orden, no la más larga", () => {
    // «impresiones» va antes que «Sin servicio» por `sortOrder`.
    expect(etiqueta("¿Hacen impresiones y fotocopias?")).toBe("Servicio de impresiones");
  });

  it("un mensaje sin palabras no empareja nada", () => {
    expect(etiqueta("🙂")).toBeNull();
    expect(etiqueta("   ")).toBeNull();
  });
});
