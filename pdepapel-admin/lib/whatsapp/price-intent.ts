/**
 * Lo que dice un mensaje de WhatsApp sobre cuánto quiere gastar la clienta y
 * qué tan bueno lo quiere, sin modelo y siempre igual. El clasificador puede
 * sumar ranuras, pero el precio y la calidad salen de aquí aunque no conteste.
 *
 * Se lee sobre una copia en minúsculas y sin tildes, del mismo largo que el
 * mensaje: así lo que se reconoce se corta del original sin tocar el resto.
 *
 *  - barato / económico / que no sea caro … → lo más económico primero; nunca
 *    hay un umbral de «barato».
 *  - menos de X, hasta X, tengo X, mi presupuesto es X … → tope X.
 *  - como de X, más o menos X, unos X, de X … → cerca de X (±30 %).
 *  - entre X y Y, de X a Y → rango.
 *  - más de X, desde X → piso, de menor a mayor.
 *  - buenos, de buena calidad, de marca, cuál me recomiendas … → calidad.
 *    Con «barato» al tiempo («buenos y baratos») es VALOR.
 *  - regalo, para regalar, un detalle → los productos de regalo.
 *
 * Un número seguido de hojas, piezas, colores, x, cm o ml es una cantidad y
 * no un precio: «cuaderno de 100 hojas», «kit de 3 piezas».
 */

export type PriceKind = "cheapest" | "ceiling" | "around" | "range" | "floor";

/** El orden de la lista que sale de la intención. */
export type ShoppingSort = "cheapest" | "closest" | "ascending" | "quality" | "value";

export interface PriceIntent {
  /** Lo que dijo del precio; null si solo habló de calidad. */
  kind: PriceKind | null;
  /** Pidió calidad («buenos», «de marca», «cuál me recomiendas»). */
  quality: boolean;
  sort: ShoppingSort;
  minPrice: number | null;
  maxPrice: number | null;
  /** El valor de «como de X»: se busca cerca de él. */
  target: number | null;
}

export interface ParsedShoppingIntent {
  price: PriceIntent | null;
  /** Habló de regalo: sin otra palabra de producto, se buscan los de regalo. */
  gift: boolean;
  /** El mensaje sin las palabras de precio, de calidad ni de regalo. */
  rest: string;
}

/** «Como de X» busca entre X − 30 % y X + 30 %. */
export const AROUND_TOLERANCE = 0.3;

const B = "(?<![a-z0-9])";
const E = "(?![a-z0-9])";

// --- Cantidades ----------------------------------------------------------------

const UNIDADES = ["un", "uno", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIEZ_A_VEINTINUEVE: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const valorUnidad = (w: string) => (w === "un" || w === "uno" || w === "una" ? 1 : UNIDADES.indexOf(w) - 1);

const alt = (words: string[]) => words.sort((a, b) => b.length - a.length).join("|");
const U = `(?:${alt([...UNIDADES])})`;
const T = `(?:${alt(Object.keys(DIEZ_A_VEINTINUEVE))})`;
const D = `(?:${alt(Object.keys(DECENAS))})`;
const C = `(?:${alt(Object.keys(CENTENAS))})`;
const MENOR_QUE_CIEN = `(?:${D}(?:\\s+y\\s+${U})?|${T}|${U})`;
const EN_PALABRAS = `(?:${C}(?:\\s+${MENOR_QUE_CIEN})?|${MENOR_QUE_CIEN})`;

/** En Colombia una luca o una barra son mil pesos. */
const MILES = `(?:mil|k|lucas?|luquitas?|barras?)${E}`;
const CIFRA = `(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)`;

/** Una cantidad de dinero: «10000», «10.000», «$10.000», «10 mil», «10k», «diez mil», «10 lucas», «mil». */
const AMOUNT =
  `(?:\\$\\s*)?(?:${CIFRA}(?:\\s*${MILES})?|${EN_PALABRAS}\\s+${MILES}|mil${E}|una\\s+(?:luca|barra)${E})(?:\\s+pesos${E})?`;

/** Lo que convierte un número en cantidad de cosas. */
const QUANTITY_AFTER = new RegExp(
  `^\\s*(?:hojas?|unidades|unidad|uds?|und|piezas?|pzs?|pcs|colores|tonos|x|cm|mm|ml|mts?|metros|gr|g|gramos|pares|paquetes|cuadros|anos|meses|${"puntas"})${E}`,
);

function enPalabras(texto: string): number | null {
  const palabras = texto.trim().split(/\s+/).filter((w) => w !== "y");
  let total = 0;
  for (const w of palabras) {
    if (w in CENTENAS) total += CENTENAS[w];
    else if (w in DIEZ_A_VEINTINUEVE) total += DIEZ_A_VEINTINUEVE[w];
    else if (w in DECENAS) total += DECENAS[w];
    else if (UNIDADES.includes(w)) total += valorUnidad(w);
    else return null;
  }
  return total > 0 ? total : null;
}

/**
 * El valor en pesos de una cantidad ya reconocida, o null si no parece
 * dinero. Un número pelado y pequeño («hasta 12») no es precio: pueden ser
 * hojas o colores. Con `bare` se acepta sin unidad (el primer extremo de
 * «entre 2 y 5 mil», que hereda la unidad del segundo).
 */
export function amountValue(span: string, options: { bare?: boolean } = {}): number | null {
  const s = span.trim();
  const conPesos = s.includes("$") || /\bpesos$/.test(s);
  const limpio = s.replace(/\$/g, "").replace(/\s+pesos$/, "").trim();
  if (/^mil$/.test(limpio) || /^una\s+(?:luca|barra)$/.test(limpio)) return 1000;
  const miles = limpio.match(new RegExp(`^(.*?)\\s*(mil|k|lucas?|luquitas?|barras?)$`));
  const cuerpo = (miles ? miles[1] : limpio).trim();
  let valor: number | null;
  let separadorDeMiles = false;
  if (/^\d/.test(cuerpo)) {
    separadorDeMiles = /^\d{1,3}(?:[.,]\d{3})+$/.test(cuerpo);
    valor = separadorDeMiles ? Number(cuerpo.replace(/[.,]/g, "")) : Number(cuerpo.replace(",", "."));
  } else {
    valor = enPalabras(cuerpo);
    if (valor !== null && !miles && !options.bare) return null;
  }
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return null;
  if (miles) return Math.round(valor * 1000);
  if (separadorDeMiles || conPesos || valor >= 1000 || options.bare) return Math.round(valor);
  return null;
}

// --- Patrones -----------------------------------------------------------------

type Rol = "around" | "range" | "floor" | "ceiling" | "aroundBare" | "cheap" | "quality" | "gift";

interface Patron {
  rol: Rol;
  re: RegExp;
}

const p = (rol: Rol, source: string): Patron => ({ rol, re: new RegExp(`${B}(?:${source})${E}`, "g") });

const A = `(${AMOUNT})`;
const LOOSE = `(${CIFRA}|${EN_PALABRAS})`;

/**
 * El orden importa: «más o menos 10 mil» no es «menos de», «de más de 30»
 * no es «de 30», y «libretas de menos de 8.000» no es «de 8.000».
 */
const PATRONES: Patron[] = [
  p("around", `(?:como\\s+(?:de|en|por)|mas\\s+o\\s+menos(?:\\s+de)?|alrededor\\s+de|unos|unas|por\\s+ahi\\s+de|por\\s+ahi|cerca\\s+de|aproximadamente(?:\\s+de)?|aprox(?:\\s+de)?)\\s+${A}`),
  p("range", `(?:entre\\s+${LOOSE}\\s*(?:mil\\s+)?y\\s+${A}|(?:de|desde)\\s+${LOOSE}\\s*(?:mil\\s+)?(?:a|hasta)\\s+${A})`),
  p("floor", `(?<!no\\s)(?:de\\s+)?(?:mas\\s+de|desde|por\\s+encima\\s+de|arriba\\s+de|minimo(?:\\s+de)?)\\s+${A}`),
  p(
    "ceiling",
    `(?:de\\s+|por\\s+)?(?:menos\\s+de|hasta|maximo(?:\\s+de)?|max|por\\s+debajo\\s+de|no\\s+mas\\s+de|que\\s+no\\s+pase(?:n)?\\s+de|que\\s+no\\s+supere(?:n)?|tengo|tenemos|cuento\\s+con|con|(?:mi|el|un)\\s+presupuesto\\s+(?:es\\s+)?(?:de\\s+)?|presupuesto\\s+de|presupuesto)\\s*${A}`,
  ),
  p("ceiling", `(?:de\\s+|por\\s+|en\\s+)?${A}\\s+o\\s+menos`),
  p("aroundBare", `(?:de|por)\\s+${A}`),

  p("cheap", `(?:(?:lo|los|las|la|el)\\s+)?(?:mas\\s+)?barat(?:isim[oa]s?|ic[oa]s?|it[oa]s?|[oa]s?)`),
  p("cheap", `(?:(?:lo|los|las|la|el)\\s+)?(?:mas\\s+)?(?:economic[oa]s?|economiquit[oa]s?)`),
  p("cheap", `(?:a\\s+|de\\s+|con\\s+)?(?:un\\s+|el\\s+)?(?:buen(?:os)?|mejor(?:es)?)\\s+precios?`),
  p("cheap", `(?:a\\s+|de\\s+|con\\s+)?(?:un\\s+)?precios?\\s+(?:baj[oi]s?|comod[oa]s?|accesibles?|economic[oa]s?|razonables?)`),
  p("cheap", `(?:a\\s+|de\\s+)?bajo\\s+precio`),
  p("cheap", `(?:que\\s+)?no\\s+(?:(?:sea|sean|este|esten|salga|salgan)\\s+)?(?:tan\\s+|muy\\s+|tampoco\\s+)?car(?:o|a|os|as|it[oa]s?)`),
  p("cheap", `algo\\s+(?:sencill(?:o|a|it[oa])|baratic[oa]|economic[oa])`),
  p("cheap", `por\\s+poquit[oa]`),
  p("cheap", `(?:para|sin)\\s+(?:no\\s+)?gastar\\s+(?:mucho|tanto|demasiado)`),

  p("quality", `(?:de\\s+)?(?:muy\\s+)?(?:buena|excelente|alta|mejor)\\s+calidad|de\\s+calidad|calidad`),
  p("quality", `(?:(?:el|la|los|las|lo)\\s+)mejor(?:es)?|mejores|cual(?:es)?\\s+(?:es|son)\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+)?mejor(?:es)?`),
  p("quality", `que\\s+duren?|duraderos?|duraderas?|resistentes?|profesional(?:es)?|de\\s+marca|premium`),
  p("quality", `que\\s+no\\s+se\\s+sequen?|que\\s+(?:pinten|escriban|marquen|corten|peguen|pinte|escriba|marque|corte|pegue)\\s+bien`),
  p("quality", `(?:cual(?:es)?\\s+|que\\s+)?(?:me\\s+)?recomienda(?:s|n)?|recomiendame|recomiendenme|recomendad[oa]s?`),
  p("quality", `(?:algo\\s+)?mas\\s+(?:bonit|complet)(?:o|a|os|as)`),
  p("quality", `fin(?:o|a|os|as)|buen(?:o|a|os|as)?|buenisim[oa]s?`),

  p(
    "gift",
    `(?:para\\s+)?(?:un\\s+|una\\s+|de\\s+|como\\s+)?(?:regal(?:o|os|ito|itos)|obsequios?)(?:\\s+para\\s+(?:mi|su|tu|una|un)\\s+[a-z]+)?|(?:para\\s+)?regalar(?:le|les)?(?:\\s+a\\s+(?:mi|su|tu|una|un)\\s+[a-z]+)?|(?:para\\s+|como\\s+)?(?:un\\s+)?detall(?:ito|itos)|(?:para\\s+|como\\s+)?un\\s+detalle`,
  ),
];

/** Lo que va antes de un «bueno» de saludo o de relleno: «ok bueno», «bueno, gracias». */
const RELLENO_INICIAL = /^(?:(?:ok|okay|okey|ah|ay|aja|pues|ya|y|si|listo|vale|muy|hola|uy|ahh?)\s*[,.!¡]?\s*)*$/;
const SALUDO_DESPUES = /^\s*(?:tardes|dias|dia|noches)(?![a-z0-9])/;
/**
 * Un «bueno» al empezar es saludo o relleno cuando le sigue un signo, nada, u
 * otra muletilla o pregunta: «bueno, gracias», «bueno sí», «buenas tienen…».
 * «Buenos y baratos» o «buenas tijeras» sí piden calidad.
 */
const RELLENO_DESPUES =
  /^\s*(?:$|[,.;:!?¡¿~-]|(?:si|no|gracias|ok|listo|entonces|pues|vale|dale|ya|tienen|tiene|tienes|quisiera|queria|quiero|necesito|me|una|un|para|hola|vendes|venden|disculpa|perdon|como|donde|cuanto|cuando)(?![a-z0-9]))/;

/** Un número sin pesos ni miles seguido de hojas, piezas, x… es una cantidad. */
function esCantidad(m: RegExpMatchArray, despues: string): boolean {
  const cifra = m.slice(1).filter(Boolean).pop() ?? "";
  const esDinero = /\$|pesos|\d[.,]\d{3}|(?:mil|k|lucas?|luquitas?|barras?)\s*$/.test(cifra.trim());
  return !esDinero && QUANTITY_AFTER.test(despues);
}

function esCalidadDeVerdad(plain: string, start: number, match: string): boolean {
  if (/^(?:fin|buen)/.test(match)) {
    const antes = plain.slice(0, start);
    if (/^fin/.test(match)) return !/puntas?\s+$/.test(antes);
    const alEmpezar = RELLENO_INICIAL.test(antes.replace(/[¿?¡!,.;:~\-\s]+/g, " ").trim());
    if (alEmpezar && RELLENO_DESPUES.test(plain.slice(start + match.length))) return false;
    if (SALUDO_DESPUES.test(plain.slice(start + match.length))) return false;
  }
  return true;
}

// --- Lectura ---------------------------------------------------------------------

/** Minúsculas y sin tildes, con el mismo largo cuando el mensaje viene en NFC. */
function plano(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Tomado {
  start: number;
  end: number;
}

const solapa = (tomados: Tomado[], start: number, end: number) =>
  tomados.some((t) => start < t.end && end > t.start);

export function parseShoppingIntent(body: string): ParsedShoppingIntent {
  const original = body.normalize("NFC");
  const plain = plano(original);
  // Algún carácter raro cambia de largo al pasarlo a minúsculas: se corta sobre la copia.
  const base = plain.length === original.length ? original : plain;
  const tomados: Tomado[] = [];

  let barato = false;
  let quality = false;
  let gift = false;
  let around: number | null = null;
  let aroundExplicito = false;
  let floor: number | null = null;
  let ceiling: number | null = null;

  for (const { rol, re } of PATRONES) {
    re.lastIndex = 0;
    for (const m of Array.from(plain.matchAll(re))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (solapa(tomados, start, end)) continue;

      if (rol === "cheap") barato = true;
      else if (rol === "gift") gift = true;
      else if (rol === "quality") {
        if (!esCalidadDeVerdad(plain, start, m[0])) continue;
        quality = true;
      } else {
        if (esCantidad(m, plain.slice(end))) continue;
        if (rol === "range") {
          const alto = amountValue(m[2] ?? m[4] ?? "");
          const crudoBajo = (m[1] ?? m[3] ?? "").trim();
          let bajo = amountValue(crudoBajo, { bare: true });
          if (alto === null || bajo === null) continue;
          // «entre 2 y 5 mil»: el 2 hereda los miles del 5.
          if (bajo < alto / 100 && !/[.,]\d{3}/.test(crudoBajo) && amountValue(crudoBajo) === null) bajo *= 1000;
          if (bajo > alto) continue;
          floor = floor === null ? bajo : Math.max(floor, bajo);
          ceiling = ceiling === null ? alto : Math.min(ceiling, alto);
        } else {
          const valor = amountValue(m[1] ?? "");
          if (valor === null) continue;
          if (rol === "ceiling") ceiling = ceiling === null ? valor : Math.min(ceiling, valor);
          else if (rol === "floor") floor = floor === null ? valor : Math.max(floor, valor);
          else if (around === null) {
            around = valor;
            aroundExplicito = rol === "around";
          }
        }
      }
      tomados.push({ start, end });
    }
  }

  // «cuadernos de 10 mil hasta 20 mil» ya es rango; un «de X» suelto junto a un
  // tope dicho («de 10 mil, que no pase de 15») cede ante el tope.
  if (around !== null && !aroundExplicito && (ceiling !== null || floor !== null)) around = null;

  let kind: PriceKind | null = null;
  if (floor !== null && ceiling !== null) kind = floor <= ceiling ? "range" : "ceiling";
  else if (ceiling !== null) kind = "ceiling";
  else if (floor !== null) kind = "floor";
  else if (around !== null) kind = "around";
  else if (barato) kind = "cheapest";
  if (kind === "ceiling") floor = null;

  let rest = base;
  for (const t of [...tomados].sort((a, b) => b.start - a.start)) {
    rest = `${rest.slice(0, t.start)} ${rest.slice(t.end)}`;
  }
  rest = rest.replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();

  if (kind === null && !quality) return { price: null, gift, rest: gift ? rest : body };

  const sort: ShoppingSort = quality
    ? barato
      ? "value"
      : "quality"
    : kind === "around"
      ? "closest"
      : kind === "floor"
        ? "ascending"
        : "cheapest";

  return {
    price: {
      kind,
      quality,
      sort,
      minPrice: kind === "range" || kind === "floor" ? floor : null,
      maxPrice: kind === "range" || kind === "ceiling" ? ceiling : null,
      target: kind === "around" ? around : null,
    },
    gift,
    rest,
  };
}

/** La ventana de «como de X». */
export function aroundWindow(target: number): { min: number; max: number } {
  return {
    min: Math.floor(target * (1 - AROUND_TOLERANCE)),
    max: Math.ceil(target * (1 + AROUND_TOLERANCE)),
  };
}

/**
 * Lo que queda suelto al quitar el precio y que no nombra un producto:
 * «tengo 20 mil …», «… pero económicos», «cuál agenda me recomiendas», y para
 * quién es («algo sencillito para mi hija»).
 */
const RESIDUAL_FILLER = new Set([
  "tengo", "tenemos", "tengan", "tenga", "tengas", "vendan", "venda", "pero", "bueno", "buena",
  "buenas", "buenos", "ok", "okay", "listo", "cual", "cuales", "sean", "sea", "alcanza", "quiero", "busco",
  "hija", "hijo", "hijas", "hijos", "mama", "papa", "novia", "novio", "amiga", "amigo",
  "hermana", "hermano", "sobrina", "sobrino", "nieta", "nieto", "esposa", "esposo", "profe",
  "profesora", "profesor",
]);

export function isResidualFiller(token: string): boolean {
  return RESIDUAL_FILLER.has(plano(token));
}

/** Una intención escrita a mano (vistas previas, pruebas): lo más económico, con tope si se da. */
export function cheapestIntent(maxPrice: number | null = null): PriceIntent {
  return {
    kind: maxPrice === null ? "cheapest" : "ceiling",
    quality: false,
    sort: "cheapest",
    minPrice: null,
    maxPrice,
    target: null,
  };
}
