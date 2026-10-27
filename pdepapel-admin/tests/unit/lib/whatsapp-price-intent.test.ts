import { describe, expect, it } from "vitest";

import { searchTokens } from "@/lib/search-terms";
import {
  amountValue,
  aroundWindow,
  parseShoppingIntent,
  isResidualFiller,
  type PriceKind,
  type ShoppingSort,
} from "@/lib/whatsapp/price-intent";

interface Esperado {
  kind: PriceKind | null;
  sort: ShoppingSort;
  min?: number | null;
  max?: number | null;
  target?: number | null;
  quality?: boolean;
  gift?: boolean;
  /** Lo que queda para buscar. */
  busca: string[];
}

const palabras = (rest: string) => searchTokens(rest).filter((t) => !isResidualFiller(t));

/**
 * Frases como las escriben las clientas por WhatsApp. Cada fila dice qué
 * intención sale, con qué cifras y qué palabras quedan para buscar.
 */
const CORPUS: [string, Esperado][] = [
  // --- Lo más económico -------------------------------------------------------
  ["marcadores baratos", { kind: "cheapest", sort: "cheapest", busca: ["marcadores"] }],
  ["¿Tienen agendas económicas?", { kind: "cheapest", sort: "cheapest", busca: ["agendas"] }],
  ["lo más barato que tengan en cuadernos", { kind: "cheapest", sort: "cheapest", busca: ["cuadernos"] }],
  ["colores a bajo precio", { kind: "cheapest", sort: "cheapest", busca: ["colores"] }],
  ["stickers a buen precio", { kind: "cheapest", sort: "cheapest", busca: ["stickers"] }],
  ["libretas de precio cómodo", { kind: "cheapest", sort: "cheapest", busca: ["libretas"] }],
  ["mochilas con precio accesible", { kind: "cheapest", sort: "cheapest", busca: ["mochilas"] }],
  ["agendas que no sean caras", { kind: "cheapest", sort: "cheapest", busca: ["agendas"] }],
  ["un cuaderno no muy caro", { kind: "cheapest", sort: "cheapest", busca: ["cuaderno"] }],
  ["algo sencillito para mi hija", { kind: "cheapest", sort: "cheapest", busca: [] }],
  ["unos stickers baraticos", { kind: "cheapest", sort: "cheapest", busca: ["stickers"] }],
  ["algo por poquito", { kind: "cheapest", sort: "cheapest", busca: [] }],
  ["algo barato", { kind: "cheapest", sort: "cheapest", busca: [] }],
  ["qué tienen económico", { kind: "cheapest", sort: "cheapest", busca: [] }],
  ["un detallito para no gastar mucho", { kind: "cheapest", sort: "cheapest", gift: true, busca: [] }],
  ["Colores Económicos", { kind: "cheapest", sort: "cheapest", busca: ["colores"] }],
  ["el mejor precio en resaltadores", { kind: "cheapest", sort: "cheapest", busca: ["resaltadores"] }],

  // --- Tope ----------------------------------------------------------------------
  ["cuadernos de menos de 10 mil", { kind: "ceiling", sort: "cheapest", max: 10000, busca: ["cuadernos"] }],
  ["libretas de menos de 8.000", { kind: "ceiling", sort: "cheapest", max: 8000, busca: ["libretas"] }],
  ["hasta 15000 en colores", { kind: "ceiling", sort: "cheapest", max: 15000, busca: ["colores"] }],
  ["máximo $12.500", { kind: "ceiling", sort: "cheapest", max: 12500, busca: [] }],
  ["no más de 20,000", { kind: "ceiling", sort: "cheapest", max: 20000, busca: [] }],
  ["una agenda que no pase de 30 lucas", { kind: "ceiling", sort: "cheapest", max: 30000, busca: ["agenda"] }],
  ["tengo 20 mil para un regalo", { kind: "ceiling", sort: "cheapest", max: 20000, gift: true, busca: [] }],
  ["tengo 30 mil para un regalo", { kind: "ceiling", sort: "cheapest", max: 30000, gift: true, busca: [] }],
  ["con 10k qué me alcanza", { kind: "ceiling", sort: "cheapest", max: 10000, busca: [] }],
  ["mi presupuesto es de 50 mil", { kind: "ceiling", sort: "cheapest", max: 50000, busca: [] }],
  ["un presupuesto de veinte mil para stickers", { kind: "ceiling", sort: "cheapest", max: 20000, busca: ["stickers"] }],
  ["cartucheras por 25 mil o menos", { kind: "ceiling", sort: "cheapest", max: 25000, busca: ["cartucheras"] }],
  ["tengo diez mil", { kind: "ceiling", sort: "cheapest", max: 10000, busca: [] }],
  ["hasta 10 barras", { kind: "ceiling", sort: "cheapest", max: 10000, busca: [] }],
  ["hasta 5mil", { kind: "ceiling", sort: "cheapest", max: 5000, busca: [] }],
  ["marcadores baratos de menos de 3 mil", { kind: "ceiling", sort: "cheapest", max: 3000, busca: ["marcadores"] }],

  // --- Cerca de X --------------------------------------------------------------
  ["cuadernos de 10 lucas", { kind: "around", sort: "closest", target: 10000, busca: ["cuadernos"] }],
  ["algo como de 15 mil", { kind: "around", sort: "closest", target: 15000, busca: [] }],
  ["más o menos 20 mil en colores", { kind: "around", sort: "closest", target: 20000, busca: ["colores"] }],
  ["unos 8 mil pesos", { kind: "around", sort: "closest", target: 8000, busca: [] }],
  ["alrededor de $40.000", { kind: "around", sort: "closest", target: 40000, busca: [] }],
  ["por ahí de 12 luquitas", { kind: "around", sort: "closest", target: 12000, busca: [] }],
  ["un kit de mil", { kind: "around", sort: "closest", target: 1000, busca: ["kit"] }],
  ["tienen tote bag de 35 mil?", { kind: "around", sort: "closest", target: 35000, busca: ["tote", "bag"] }],

  // --- Rango ----------------------------------------------------------------------
  ["stickers entre 2 y 5 mil", { kind: "range", sort: "cheapest", min: 2000, max: 5000, busca: ["stickers"] }],
  ["entre 10.000 y 20.000", { kind: "range", sort: "cheapest", min: 10000, max: 20000, busca: [] }],
  ["agendas de 20 a 30 mil", { kind: "range", sort: "cheapest", min: 20000, max: 30000, busca: ["agendas"] }],
  ["entre dos y cinco mil", { kind: "range", sort: "cheapest", min: 2000, max: 5000, busca: [] }],
  ["desde 10 mil hasta 15 mil", { kind: "range", sort: "cheapest", min: 10000, max: 15000, busca: [] }],

  // --- Piso -----------------------------------------------------------------------
  ["cartucheras más de 30 mil", { kind: "floor", sort: "ascending", min: 30000, busca: ["cartucheras"] }],
  ["algo de más de 50 mil", { kind: "floor", sort: "ascending", min: 50000, busca: [] }],
  ["kits desde 40k", { kind: "floor", sort: "ascending", min: 40000, busca: ["kits"] }],

  // --- Calidad --------------------------------------------------------------------
  ["marcadores buenos", { kind: null, sort: "quality", quality: true, busca: ["marcadores"] }],
  ["colores de buena calidad", { kind: null, sort: "quality", quality: true, busca: ["colores"] }],
  ["¿cuál agenda me recomiendas?", { kind: null, sort: "quality", quality: true, busca: ["agenda"] }],
  ["los mejores resaltadores", { kind: null, sort: "quality", quality: true, busca: ["resaltadores"] }],
  ["lo mejor que tengan en mochilas", { kind: null, sort: "quality", quality: true, busca: ["mochilas"] }],
  ["unos colores que duren", { kind: null, sort: "quality", quality: true, busca: ["colores"] }],
  ["cartucheras resistentes", { kind: null, sort: "quality", quality: true, busca: ["cartucheras"] }],
  ["colores profesionales", { kind: null, sort: "quality", quality: true, busca: ["colores"] }],
  ["cuadernos de marca", { kind: null, sort: "quality", quality: true, busca: ["cuadernos"] }],
  ["stickers premium", { kind: null, sort: "quality", quality: true, busca: ["stickers"] }],
  ["marcadores que no se sequen", { kind: null, sort: "quality", quality: true, busca: ["marcadores"] }],
  ["lapiceros que escriban bien", { kind: null, sort: "quality", quality: true, busca: ["lapiceros"] }],
  ["una agenda más bonita", { kind: null, sort: "quality", quality: true, busca: ["agenda"] }],
  ["un kit más completo", { kind: null, sort: "quality", quality: true, busca: ["kit"] }],
  ["mochilas recomendadas", { kind: null, sort: "quality", quality: true, busca: ["mochilas"] }],
  ["Bueno, ¿tienen marcadores buenos?", { kind: null, sort: "quality", quality: true, busca: ["marcadores"] }],
  ["unas tijeras finas", { kind: null, sort: "quality", quality: true, busca: ["tijeras"] }],

  // --- Calidad con precio ------------------------------------------------------------
  ["buenos y baratos", { kind: "cheapest", sort: "value", quality: true, busca: [] }],
  ["colores de buena calidad pero económicos", { kind: "cheapest", sort: "value", quality: true, busca: ["colores"] }],
  ["marcadores buenos y económicos", { kind: "cheapest", sort: "value", quality: true, busca: ["marcadores"] }],
  ["cuadernos buenos de menos de 20 mil", { kind: "ceiling", sort: "quality", quality: true, max: 20000, busca: ["cuadernos"] }],
  ["una agenda buena como de 30 mil", { kind: "around", sort: "quality", quality: true, target: 30000, busca: ["agenda"] }],
];

/** Mensajes que NO hablan de precio ni de calidad. */
const NEGATIVOS = [
  "¿tienen la carpeta baja?",
  "cuaderno de 100 hojas",
  "colores x 12",
  "kit de 3 piezas",
  "ref 2000",
  "cuaderno de 200 hojas cuadriculado",
  "marcadores de 24 colores",
  "regla de 30 cm",
  "pegante de 250 ml",
  "set de 10 unidades",
  "tienen micropuntas punta fina",
  "Buenas tardes",
  "buenos días, ¿tienen agendas?",
  "buenas noches",
  "bueno, gracias",
  "bueno sí",
  "ok bueno",
  "Bueno",
  "hola buenas, ¿tienen tote bag?",
  "muy buenas, quería preguntar por un pedido",
  "lo quiero para el 15 de noviembre",
  "mi hija tiene 10 años",
];

describe("intención de precio y calidad", () => {
  it("el corpus tiene al menos 40 frases de precio y 15 de calidad", () => {
    const precio = CORPUS.filter(([, e]) => e.kind !== null && !e.quality).length;
    const calidad = CORPUS.filter(([, e]) => e.quality).length;
    expect(precio).toBeGreaterThanOrEqual(40);
    expect(calidad).toBeGreaterThanOrEqual(15);
  });

  it.each(CORPUS)("«%s»", (body, e) => {
    const r = parseShoppingIntent(body);
    expect(r.price).not.toBeNull();
    expect({
      kind: r.price!.kind,
      sort: r.price!.sort,
      min: r.price!.minPrice,
      max: r.price!.maxPrice,
      target: r.price!.target,
      quality: r.price!.quality,
      gift: r.gift,
      busca: palabras(r.rest),
    }).toEqual({
      kind: e.kind,
      sort: e.sort,
      min: e.min ?? null,
      max: e.max ?? null,
      target: e.target ?? null,
      quality: e.quality ?? false,
      gift: e.gift ?? false,
      busca: e.busca,
    });
  });

  it.each(NEGATIVOS)("«%s» no es precio ni calidad", (body) => {
    const r = parseShoppingIntent(body);
    expect(r.price).toBeNull();
    expect(r.rest).toBe(body);
  });

  it("el regalo sin precio solo marca el regalo", () => {
    const r = parseShoppingIntent("qué tienen para regalar");
    expect(r).toMatchObject({ price: null, gift: true });
    expect(palabras(r.rest)).toEqual([]);
  });

  it("«para un regalo para mi mamá» no deja a la mamá como producto", () => {
    expect(palabras(parseShoppingIntent("tengo 30 mil para un regalo para mi mamá").rest)).toEqual([]);
  });
});

describe("cantidades de dinero", () => {
  it.each([
    ["10000", 10000],
    ["10.000", 10000],
    ["10,000", 10000],
    ["$10.000", 10000],
    ["10 mil", 10000],
    ["10mil", 10000],
    ["10k", 10000],
    ["diez mil", 10000],
    ["veinticinco mil", 25000],
    ["treinta y cinco mil", 35000],
    ["dos mil", 2000],
    ["quinientos mil", 500000],
    ["10 lucas", 10000],
    ["10 luquitas", 10000],
    ["10 barras", 10000],
    ["una luca", 1000],
    ["mil", 1000],
    ["2,5 mil", 2500],
    ["12 pesos", 12],
  ] as const)("«%s» = %d", (texto, valor) => {
    expect(amountValue(texto)).toBe(valor);
  });

  it("un número pelado y pequeño no es dinero", () => {
    expect(amountValue("12")).toBeNull();
    expect(amountValue("diez")).toBeNull();
    expect(amountValue("12", { bare: true })).toBe(12);
  });

  it("«como de X» busca un 30 % por debajo y por encima", () => {
    expect(aroundWindow(10000)).toEqual({ min: 7000, max: 13000 });
  });
});
