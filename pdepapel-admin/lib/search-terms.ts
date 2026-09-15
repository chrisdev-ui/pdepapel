import { Prisma } from "@prisma/client";

/**
 * Sinónimos de papelería tal como los escribe la clientela colombiana. Cada
 * grupo se expande en ambos sentidos: «libreta» encuentra cuadernos y
 * «cuaderno» encuentra libretas.
 */
const SYNONYM_GROUPS: string[][] = [
  ["cuaderno", "libreta", "block", "bloc"],
  ["bolígrafo", "lapicero", "esfero", "pluma", "birome"],
  ["resaltador", "subrayador", "highlighter"],
  ["marcador", "plumón", "rotulador"],
  ["sticker", "calcomanía", "pegatina", "adhesivo"],
  ["tajalápiz", "sacapuntas", "tajador"],
  ["borrador", "goma"],
  ["cartuchera", "estuche", "lapicera"],
  ["washi", "cinta decorativa", "masking"],
  ["carpeta", "folder", "archivador"],
  ["separador", "marcapáginas", "bookmark"],
  ["llavero", "keychain"],
  ["agenda", "planner", "planificador"],
  ["notas adhesivas", "post-it", "sticky notes"],
  ["tijeras", "tijera"],
  ["pegante", "pegamento", "colbón"],
  ["mug", "taza", "pocillo"],
  ["kit", "set", "combo"],
];

const MAX_TERMS = 8;

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const singular = (word: string) =>
  word.length > 4 && word.endsWith("es") && !word.endsWith("ses")
    ? word.slice(0, -2)
    : word.length > 3 && word.endsWith("s")
      ? word.slice(0, -1)
      : word;

const synonymsByWord = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    synonymsByWord.set(
      stripAccents(word),
      group.filter((other) => other !== word),
    );
  }
}

export function normalizeSearchTerm(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CO");
}

/**
 * Devuelve el término tal cual más sus variantes con sinónimos, sin
 * duplicados y acotado. Una consulta vacía devuelve una lista vacía.
 */
export function expandSearchTerms(query: string): string[] {
  const normalized = normalizeSearchTerm(query);
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);
  const words = normalized.split(" ");

  words.forEach((word, index) => {
    const key = singular(stripAccents(word));
    const synonyms = synonymsByWord.get(key) ?? [];
    for (const synonym of synonyms) {
      if (terms.size >= MAX_TERMS) return;
      const variant = [...words];
      variant[index] = synonym;
      terms.add(variant.join(" "));
    }
  });

  return Array.from(terms);
}

/** Condiciones `name contains` para cada variante; vacío cuando no hay consulta. */
export function productNameSearchWhere(query: string): Prisma.ProductWhereInput[] {
  return expandSearchTerms(query).map((term) => ({ name: { contains: term } }));
}

export function productGroupNameSearchWhere(query: string): Prisma.ProductGroupWhereInput[] {
  return expandSearchTerms(query).map((term) => ({ name: { contains: term } }));
}

/** Palabras de unión: aparecen en casi todo y no dicen qué se busca. */
const STOP_WORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "para", "por", "y", "o", "que", "algo", "cosa", "cosas",
]);

/** Palabras de dos letras o menos aparecen dentro de demasiados nombres. */
const MIN_TOKEN_LENGTH = 3;

export function searchTokens(query: string): string[] {
  return normalizeSearchTerm(query)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(word));
}

/**
 * Búsqueda palabra por palabra, para cuando alguien pide dos cosas a la vez.
 *
 * `productNameSearchWhere` busca la frase entera dentro del nombre, que es lo
 * que quiere el buscador de la tienda: quien escribe «cuaderno» y va viendo
 * resultados. Por WhatsApp se pide de otra forma —«cuaderno de Stitch»— y esa
 * frase no está dentro de ningún nombre: medido contra el catálogo real, diez
 * de diez consultas así devolvían CERO.
 *
 * Aquí cada palabra tiene que aparecer por separado (en el nombre, con sus
 * sinónimos, o en la descripción) y se exigen todas. Las mismas diez consultas
 * pasan a devolver entre uno y seis productos, o cero de verdad cuando no se
 * tiene lo que piden.
 *
 * Va aparte a propósito: el buscador de la tienda se queda como está.
 */
export function productTokenSearchWhere(query: string): Prisma.ProductWhereInput[] {
  return searchTokens(query).map((token) => ({
    OR: [
      ...expandSearchTerms(token).map((term) => ({
        name: { contains: term },
      })),
      { description: { contains: token } },
    ],
  }));
}
