import { describe, expect, it } from "vitest";

import {
  LICENSED_CHARACTERS,
  LICENSED_EXCLUSION_REASON,
  findLicensedCharacter,
  licensedReason,
} from "@/lib/mercadolibre/licensed-characters";

const labelOf = (name: string, extra?: (string | null)[]) => findLicensedCharacter(name, extra)?.label ?? null;
const tierOf = (name: string) => findLicensedCharacter(name)?.tier ?? null;

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
    ["Lapicero Spiderman", "Marvel"],
    ["Cuaderno La Sirenita", "Disney"],
    ["Agenda Princesa Ariel", "Disney"],
    ["Mug princesa Elsa", "Disney"],
    ["Stickers Princesa Rapunzel", "Disney"],
    ["Libreta princesa Cenicienta", "Disney"],
    ["Cartuchera Princesa Bella", "Disney"],
    ["Termo Moana", "Disney"],
    ["Cuaderno princesas Disney", "Disney"],
    ["Agenda Little Twin Stars", "Sanrio"],
    ["Llavero Tom y Jerry", "Warner Bros"],
    ["Mug Looney Tunes", "Warner Bros"],
    ["Peluche Sonic", "Sonic"],
    ["Libreta Rilakkuma", "San-X"],
    ["Stickers Sumikko Gurashi", "San-X"],
    ["Mug Miffy", "Miffy"],
    ["Cuaderno Garfield", "Garfield"],
    ["Llavero Los Simpson", "Los Simpson"],
    ["Peluche Shrek", "Shrek"],
    ["Agenda Merlina", "Merlina"],
    ["Peluche Squishmallow", "Squishmallows"],
    ["Llavero Labubu", "Labubu"],
    ["Tamagotchi original", "Tamagotchi"],
    ["Figura Hatsune Miku", "Hatsune Miku"],
    ["Peluche My Little Pony", "My Little Pony"],
    ["Medias Slytherin", "Harry Potter"],
    ["Kit Casa Hogwart Hufflepuff", "Harry Potter"],
    ["Agenda Gryffindor med", "Harry Potter"],
    ["Agenda Ravenclaw med", "Harry Potter"],
    ["Agenda Luffy", "One Piece"],
  ])("«%s» → %s (excluido)", (name, label) => {
    expect(labelOf(name)).toBe(label);
    expect(tierOf(name)).toBe("excluded");
  });

  it.each([
    ["Lápiz infinito sirenita", "sirenita"],
    ["Cuaderno Elsa", "elsa"],
    ["Agenda kitty gatito", "kitty"],
    ["Separador Pooh", "pooh"],
    ["Termo Ariel", "ariel"],
    ["Peine Rapunzel", "rapunzel"],
    ["Zapatos de Cenicienta", "cenicienta"],
    ["Agenda Wednesday", "wednesday"],
  ])("«%s» queda por revisar («%s»)", (name, matched) => {
    expect(findLicensedCharacter(name)).toMatchObject({ tier: "review", matched });
  });

  it("«Hello Kitty» solo cuenta como frase completa; «Hello» solo no", () => {
    expect(findLicensedCharacter("Mug degrade Hello")).toBeNull();
    expect(findLicensedCharacter("Mug Hello Kitty")).toMatchObject({ label: "Hello Kitty", tier: "excluded" });
  });

  it("«araña» sola no cuenta: solo Spider-Man, Spiderman u Hombre Araña", () => {
    expect(findLicensedCharacter("Lapicero Halloween Araña")).toBeNull();
    for (const name of ["Termo Spider-Man", "Termo Spiderman", "Pegante Hombre Araña"]) {
      expect(findLicensedCharacter(name)).toMatchObject({ label: "Marvel", tier: "excluded" });
    }
  });

  it("«princesa» sola no cuenta; con Disney o una princesa con nombre sí", () => {
    expect(findLicensedCharacter("Pegante Princesa x150ml")).toBeNull();
    expect(findLicensedCharacter("Corona de princesa")).toBeNull();
    expect(findLicensedCharacter("Cartuchera Princesa Bella")).toMatchObject({ tier: "excluded" });
    expect(findLicensedCharacter("Cartuchera Bella")).toBeNull();
  });

  it("el grupo del producto también delata la licencia cuando el nombre no la dice", () => {
    expect(findLicensedCharacter("Agenda Chopper", ["Agendas One Piece"])).toMatchObject({ label: "One Piece", tier: "excluded" });
  });

  it("un excluido en cualquier texto gana sobre un «por revisar» en el nombre", () => {
    expect(findLicensedCharacter("Cuaderno sirenita", [null, "Disney"])).toMatchObject({ label: "Disney", tier: "excluded" });
  });

  it.each([
    "Set de colores KIUT 12 colores",
    "Cuaderno de María",
    "Libreta Mario",
    "Agenda Marie",
    "Cuaderno con diseño de dinosaurios",
    "Planeador hojas Capibara",
    "Pegante Princesa x150ml",
    "Mug degrade Hello",
    "Set de colores KIUT 12 colores con aroma a limonada de coco",
    "Lapicero Halloween Araña",
  ])("«%s» no es un personaje con licencia", (name) => {
    expect(findLicensedCharacter(name)).toBeNull();
  });

  it("gana el personaje que aparece primero en el nombre, no el primero de la lista", () => {
    expect(labelOf("Cartuchera McDonalds Hello Kitty")).toBe("McDonald's");
    expect(findLicensedCharacter("Cartuchera Hello Kitty McDonalds")).toEqual({ label: "Hello Kitty", matched: "hello kitty", tier: "excluded" });
  });

  it("revisa también los textos extra (marca, grupo) cuando el nombre no dice nada", () => {
    expect(labelOf("Cuaderno argollado rosado", [null, "Sanrio"])).toBe("Sanrio");
    expect(labelOf("Cuaderno argollado rosado", ["P de Papel"])).toBeNull();
  });

  it("la razón en español nombra el personaje y dice el nivel", () => {
    expect(LICENSED_EXCLUSION_REASON("Snoopy")).toBe("Personaje con licencia (Snoopy): excluido de Mercado Libre.");
    expect(licensedReason(findLicensedCharacter("Lápiz infinito sirenita")!)).toBe(
      "Posible personaje con licencia (Disney, «sirenita»): por revisar. No entra en las tandas hasta que lo apruebes.",
    );
  });

  it("cada entrada tiene etiqueta y al menos un patrón", () => {
    for (const entry of LICENSED_CHARACTERS) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.patterns.length).toBeGreaterThan(0);
    }
  });
});
