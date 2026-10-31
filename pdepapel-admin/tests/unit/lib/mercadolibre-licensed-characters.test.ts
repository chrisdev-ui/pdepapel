import { describe, expect, it } from "vitest";

import {
  LICENSED_CHARACTERS,
  LICENSED_EXCLUSION_REASON,
  findLicensedCharacter,
} from "@/lib/mercadolibre/licensed-characters";

const labelOf = (name: string, extra?: (string | null)[]) => findLicensedCharacter(name, extra)?.label ?? null;

describe("personajes con licencia fuera de Mercado Libre", () => {
  it.each([
    ["Cartuchera Hello Kitty McDonalds", "Hello Kitty"],
    ["Agenda El Principito de hojas negras", "El Principito"],
    ["Tazón hermético Snoopy", "Snoopy"],
    ["Planeador hojas Stitch", "Stitch"],
    ["Cuaderno Mario Bros", "Mario Bros"],
    ["Lapicero HELLOKITTY rosado", "Hello Kitty"],
    ["Termo Spiderman", "Marvel"],
    ["Termo Spider-Man", "Marvel"],
    ["Libreta Disney", "Disney"],
    ["Peluche Minnie", "Disney"],
    ["Cuaderno Frozen", "Disney"],
    ["Separador Winnie Pooh", "Disney"],
    ["Stickers Pokémon", "Pokémon"],
    ["Cuaderno Ositos Cariñositos", "Ositos Cariñositos"],
    ["Set Kuromi y My Melody", "Sanrio"],
    ["Agenda Le Petit Prince", "El Principito"],
    ["Vaso Coca-Cola", "Coca-Cola"],
    ["Llavero McDonald's", "McDonald's"],
    ["Postales BT21", "BT21 / BTS"],
    ["Libreta Peanuts", "Snoopy"],
    ["Tazon hermetico Snoopy", "Snoopy"],
    ["Cuaderno Lilo", "Stitch"],
    ["Agenda Sanrio", "Sanrio"],
    ["Cartuchera Kuromi", "Sanrio"],
    ["Mug My Melody", "Sanrio"],
    ["Peluche Cinnamoroll", "Sanrio"],
    ["Llavero Pompompurin", "Sanrio"],
    ["Stickers Marvel", "Marvel"],
    ["Pegante Hombre Araña x150ml", "Marvel"],
    ["Cuaderno pokemon", "Pokémon"],
    ["Agenda Harry Potter", "Harry Potter"],
    ["Libreta Principito", "El Principito"],
    ["Cuaderno Little Prince", "El Principito"],
    ["Mug Hello Kitty", "Hello Kitty"],
    ["Portacarnet Doraemon", "Doraemon"],
    ["Pin Gato Pusheen", "Pusheen"],
  ])("«%s» → %s", (name, label) => {
    expect(labelOf(name)).toBe(label);
  });

  it.each([
    "Set de colores KIUT 12 colores",
    "Cuaderno de María",
    "Agenda kitty gatito",
    "Libreta Mario",
    "Separador Pooh",
    "Cuaderno Elsa",
    "Agenda Marie",
    "Cuaderno con diseño de dinosaurios",
    "Planeador hojas Capibara",
    "Pegante Princesa x150ml",
    "Lápiz infinito sirenita",
    "Mug degrade Hello",
    "Set de colores KIUT 12 colores con aroma a limonada de coco",
    "Lapicero Halloween Araña",
  ])("«%s» no es un personaje con licencia", (name) => {
    expect(findLicensedCharacter(name)).toBeNull();
  });

  it("gana el personaje que aparece primero en el nombre, no el primero de la lista", () => {
    expect(labelOf("Cartuchera McDonalds Hello Kitty")).toBe("McDonald's");
    expect(findLicensedCharacter("Cartuchera Hello Kitty McDonalds")).toEqual({ label: "Hello Kitty", matched: "hello kitty" });
  });

  it("revisa también los textos extra (marca, grupo) cuando el nombre no dice nada", () => {
    expect(labelOf("Cuaderno argollado rosado", [null, "Sanrio"])).toBe("Sanrio");
    expect(labelOf("Cuaderno argollado rosado", ["P de Papel"])).toBeNull();
  });

  it("la razón en español nombra el personaje", () => {
    expect(LICENSED_EXCLUSION_REASON("Snoopy")).toBe("Personaje con licencia (Snoopy): excluido de Mercado Libre.");
  });

  it("cada entrada tiene etiqueta y al menos un patrón", () => {
    for (const entry of LICENSED_CHARACTERS) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.patterns.length).toBeGreaterThan(0);
    }
  });
});
