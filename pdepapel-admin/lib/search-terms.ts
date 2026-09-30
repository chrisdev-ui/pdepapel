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
  // Los tote bags se piden de las cuatro formas. Sin este grupo, «bolso de
  // perrito» no encontraba ningún «Tote bag» y al revés.
  ["tote", "bag", "bolso", "bolsa"],
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
  // Palabras de unión.
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "para", "por", "y", "o", "que", "algo", "cosa", "cosas",
  // Cómo se pide algo por WhatsApp. Hacen falta para poder buscar el mensaje
  // en crudo cuando el modelo no supo separar qué se estaba pidiendo: sin
  // esto, «muéstrame» y «tienes» se buscarían como si fueran productos.
  "muestrame", "muestreme", "enseñame", "ensename", "mandame", "enviame",
  "tienes", "tiene", "tienen", "manejan", "maneja", "hay", "queda", "quedan",
  "quiero", "necesito", "busco", "dame", "vendes", "venden", "consigo",
  "cuanto", "cuesta", "vale", "valen", "precio", "porfa", "favor", "hola",
  "gracias", "disponible", "disponibles", "ver", "verlo", "verla", "mostrar",
  // Señalar sin nombrar. No son palabras de producto y no hay forma de
  // buscarlas: resolver «el primero» pide recordar la lista anterior, que es
  // otra cosa. Aquí se descartan para no buscar basura.
  "primero", "primera", "segundo", "segunda", "tercero", "tercera",
  "ultimo", "ultima", "ese", "esa", "este", "esta", "eso", "esos", "esas",
]);

/** Palabras de dos letras o menos aparecen dentro de demasiados nombres. */
const MIN_TOKEN_LENGTH = 3;

export function searchTokens(query: string): string[] {
  return normalizeSearchTerm(query)
    .split(" ")
    // Los signos pegados a la palabra («¿tienes» o «azul?») impedirían
    // reconocerla, tanto para descartarla como para buscarla.
    .map((word) => word.replace(/[¿?¡!.,;:()"']/g, "").trim())
    .filter(
      (word) =>
        word.length >= MIN_TOKEN_LENGTH &&
        // Se compara sin tildes: la lista está sin ellas y la clienta escribe
        // «muéstrame», no «muestrame».
        !STOP_WORDS.has(stripAccents(word)),
    );
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
  return searchTokens(query).map((token) => tokenWhere(token, { withDescription: true }));
}

/**
 * Lo mismo, pero SIN mirar la descripción.
 *
 * Es la primera pasada, y casi siempre la buena. Un color o un material que
 * aparece de pasada en la descripción de otro producto ensuciaba la lista:
 * medido contra el catálogo real, «borrador morado» devolvía 6 productos
 * mirando también las descripciones y 1 mirando solo el nombre —el borrador
 * morado—; «cuaderno azul pastel», 12 frente a 3.
 *
 * Ampliar a la descripción solo puede AÑADIR productos (por cada palabra es
 * «nombre O descripción»), nunca quitar. Por eso la segunda pasada es para
 * cuando el nombre no encuentra NADA, no para cuando encuentra demasiado.
 */
export function productNameTokenSearchWhere(query: string): Prisma.ProductWhereInput[] {
  return searchTokens(query).map((token) => tokenWhere(token, { withDescription: false }));
}

/**
 * La raíz con la que se compara una palabra contra una etiqueta del catálogo
 * (diseño, color, categoría, grupo).
 *
 * Las etiquetas van en una forma y la clienta escribe en otra: el color es
 * «Amarillo» y ella pide «amarilla»; el diseño es «Perrito» y ella dice
 * «perritos»; la categoría es «Cuadernos» y ella busca «cuaderno». Un
 * `contains` con la palabra tal cual falla en los tres. Quitando el plural y
 * la última vocal queda «amarill», «perrit» y «cuadern», que sí están dentro.
 *
 * Solo para etiquetas, que son cortas y de una o dos palabras: en un nombre o
 * una descripción larga, una raíz de cuatro letras encuentra de todo.
 */
export function labelStem(word: string): string {
  const base = singular(normalizeSearchTerm(word));
  return base.length >= 4 && /[aeo]$/.test(base) ? base.slice(0, -1) : base;
}

/**
 * Las condiciones de UNA palabra: en el nombre (con sinónimos), en las
 * etiquetas del catálogo y, si se pide, en la descripción.
 *
 * Las etiquetas entraron por un fallo real: «tote bag de perrito» daba cero y
 * el bot contestó «no lo tengo» con el producto activo y con existencias,
 * porque «perrito» solo vivía en el diseño del producto, que nadie miraba.
 * Medido sobre los 867 productos activos, 456 tienen el diseño fuera del
 * nombre y la descripción, 520 el color y 575 la categoría.
 *
 * Diseño y color se buscan por la raíz de la palabra: ahí no hay sinónimos
 * (un personaje se llama como se llama). Categoría y grupo sí llevan los
 * sinónimos, porque nombran tipos de producto: «libreta» tiene que dar con la
 * categoría «Cuadernos».
 */
function tokenWhere(
  token: string,
  options: { withDescription: boolean },
): Prisma.ProductWhereInput {
  const variantes = expandSearchTerms(token);
  const terminos = variantes.length ? variantes : [token];
  const raices = Array.from(new Set(terminos.map(labelStem)));
  const raiz = labelStem(token);
  return {
    OR: [
      ...terminos.map((term) => ({ name: { contains: term } })),
      { design: { is: { name: { contains: raiz } } } },
      { color: { is: { name: { contains: raiz } } } },
      ...raices.map((r) => ({ category: { is: { name: { contains: r } } } })),
      ...raices.map((r) => ({ productGroup: { is: { name: { contains: r } } } })),
      ...(options.withDescription ? [{ description: { contains: token } }] : []),
    ],
  };
}
