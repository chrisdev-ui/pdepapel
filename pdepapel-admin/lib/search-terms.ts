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
  // Los bloques de construcción se llamaban «Lego» y la clientela los sigue
  // pidiendo así. Los nombres ya no dicen «Lego» (es una marca registrada):
  // sin este grupo «lego» no encontraba nada por nombre.
  ["lego", "bloques"],
];

/**
 * Colores tal como los escribe la clientela. Cada grupo lleva los lemas en
 * masculino singular; el femenino («rosada», «amarilla») y el plural
 * («rosadas», «azules») se derivan solos, no hay que listarlos.
 *
 * Los grupos salen del catálogo real (36 colores en uso): «Rosa pastel»,
 * «Rosado», «Palo de rosa», «Lila», «Morado», «Café», «Verde aguamarina»…
 * Un grupo de uno («amarillo») existe para que «amarilla» sepa que es un
 * color y se pliegue al lema.
 */
const COLOR_GROUPS: string[][] = [
  ["rosa", "rosado"],
  ["azul"],
  ["lila", "morado", "violeta", "púrpura", "lavanda"],
  ["café", "marrón", "castaño"],
  ["negro"],
  ["blanco"],
  ["verde"],
  ["amarillo"],
  ["rojo"],
  ["naranja", "anaranjado"],
  ["crema", "beige", "hueso"],
  ["gris", "plomo"],
  ["plateado", "plata"],
  ["dorado", "oro"],
  ["fucsia", "fuxia"],
  ["transparente"],
  ["multicolor"],
  ["aguamarina", "turquesa"],
  ["fluorescente", "neón", "fluor"],
  ["metalizado", "metálico"],
  ["pastel"],
];

const MAX_TERMS = 12;

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Palabras con «s» final que no son plural, o cuyo plural no se forma
 * quitando nada: recortarlas daría otra palabra («gris» → «gri», «tres» →
 * «tre», que está dentro de «estrella»).
 */
const INVARIANT_S_WORDS = new Set([
  "gris", "dos", "tres", "seis", "mes", "bus", "gas", "pais",
  "lunes", "martes", "miercoles", "jueves", "viernes",
  "virus", "bonus", "crisis", "tesis", "dosis", "analisis",
]);

/**
 * La raíz que comparten el singular y el plural de una palabra.
 *
 * MySQL solo sabe `contains`, así que no se puede singularizar lo que está
 * guardado: lo único que sirve a los dos lados es buscar el trozo que tienen
 * en común. Para la mayoría de las palabras es el singular entero
 * («cuaderno» está dentro de «cuadernos», «papel» dentro de «papeles»).
 *
 * El «-es» es ambiguo: «sobres» es sobre + s, pero «colores» es color + es.
 * Sin diccionario no se distinguen, y no hace falta: quitando «es» queda
 * «sobr» y «color», y las dos están dentro de su singular y de su plural.
 *
 * «-z / -ces» es la excepción: «lápiz» no está dentro de «lápices», y la raíz
 * común «lápi» también está dentro de «lapicero», que es otra cosa (medido:
 * «lápices» pasaba de 10 a 76 resultados en el catálogo real). Para esas
 * palabras se devuelve el singular con z y `wordForms` añade el plural con
 * «ces» como forma aparte, sin recortar nada.
 *
 * Reglas del español, no una lista de palabras: -íes/-úes (bisturíes),
 * -ces (lápices), -es (papeles, estuches, colores), -s (cuadernos, kits,
 * stickers), y las invariables de arriba. Las tildes se dejan como vienen:
 * la base compara sin ellas («botón» encuentra «Botones»).
 */
export function pluralStem(word: string): string {
  const w = word.trim().toLocaleLowerCase("es-CO");
  if (w.length <= 3) return w;
  const plain = stripAccents(w);
  if (INVARIANT_S_WORDS.has(plain) || /(sis|xis)$/.test(plain)) return w;
  if (/[íú]es$/.test(w)) return w.slice(0, -2);
  if (/ces$/.test(w) && w.length > 4) return `${w.slice(0, -3)}z`;
  if (/es$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * Las formas con las que se compara una palabra contra el catálogo: su raíz
 * de plural y, si acaba en z, también el plural en «ces». Son formas
 * enteras, no prefijos: «lápiz» y «lápices», nunca «lápi».
 */
export function wordForms(word: string): string[] {
  const w = word.trim().toLocaleLowerCase("es-CO");
  const stem = pluralStem(w);
  if (/z$/.test(stem) && stem.length > 2) return [stem, `${stem.slice(0, -1)}ces`];
  // El «-es» ambiguo deja las dos lecturas enteras: «totes» → «tot» y
  // «tote». La corta se compara como palabra entera (ver `matchForm`), así
  // que sin la larga «Tote bag» no aparecería.
  if (stem === w.slice(0, -2) && /es$/.test(w)) return [stem, w.slice(0, -1)];
  return [stem];
}

/**
 * Formas de tres letras o menos («pin», «kit», «set», «mug») se comparan
 * como palabra entera, con su plural: dentro de otras palabras aparecen por
 * todas partes («pin» está en «pincel», «kit» en «Kitty»). Medido en el
 * catálogo real: «pines» pasaba de 1 a 19 resultados por los pinceles.
 * Las largas siguen con `contains`, que es lo que hace que «cuaderno»
 * encuentre «Cuadernos» y «lápiz» a «Portalápiz».
 */
const SHORT_FORM_LENGTH = 3;

export type FormMatch = { contains: string } | { words: string[] };

export function matchForm(form: string): FormMatch {
  if (form.length > SHORT_FORM_LENGTH) return { contains: form };
  // Una medida con decimales («0.5») es lo bastante concreta para buscarse
  // dentro de otra palabra: «0.5mm».
  if (/^\d+[.,]\d+$/.test(form)) return { contains: form };
  // Un número corto se pide como cantidad: «12» tiene que dar con «x12»
  // (paquete de doce) y con «100h» (cien hojas), no con «120» ni «2026».
  if (/^\d+$/.test(form)) return { words: [form, `x${form}`, `${form}h`, `${form}hojas`] };
  return { words: [form, `${form}s`, `${form}es`] };
}

/**
 * Lo que puede ir pegado a una palabra entera en un nombre. Medido en el
 * catálogo: comillas («"Toy Story"»), guion («XS-P»), punto («INC.»),
 * paréntesis, apóstrofo. Sin esto, «toy story» perdía el llavero porque
 * «toy» iba entre comillas.
 */
const WORD_BOUNDARIES = [" ", '"', "'", "(", ")", "-", ".", ",", "/", "+", ":"];

/**
 * Las piezas con que se emula «palabra entera» con LIKE: igual a la
 * palabra; empieza por ella seguida de un borde; termina en un borde
 * seguido de ella; o va entre un espacio y un borde (en cualquier orden).
 * Se asume que al menos uno de los dos lados es un espacio o el extremo:
 * una palabra entre dos signos («("kit")») queda fuera, y es rarísima.
 */
export function wholeWordPieces(word: string): {
  equals: string;
  startsWith: string[];
  endsWith: string[];
  contains: string[];
} {
  return {
    equals: word,
    startsWith: WORD_BOUNDARIES.map((b) => `${word}${b}`),
    endsWith: WORD_BOUNDARIES.map((b) => `${b}${word}`),
    contains: Array.from(
      new Set(WORD_BOUNDARIES.flatMap((b) => [` ${word}${b}`, `${b}${word} `])),
    ),
  };
}

/** La condición de Prisma para una forma en un campo de texto. */
export function formCondition<T extends "name" | "description">(
  field: T,
  form: string,
): Record<T, unknown> {
  const match = matchForm(form);
  if ("contains" in match) return { [field]: { contains: match.contains } } as Record<T, unknown>;
  return {
    OR: match.words.flatMap((w) => {
      const piezas = wholeWordPieces(w);
      return [
        { [field]: { equals: piezas.equals } },
        ...piezas.startsWith.map((v) => ({ [field]: { startsWith: v } })),
        ...piezas.endsWith.map((v) => ({ [field]: { endsWith: v } })),
        ...piezas.contains.map((v) => ({ [field]: { contains: v } })),
      ];
    }),
  } as unknown as Record<T, unknown>;
}

/**
 * Palabras que contienen una forma corta y SON una familia real, no ruido:
 * quien escribe «kit» también quiere ver los de Hello Kitty (medido: 10
 * productos que la palabra entera dejaba fuera). Solo valen para la
 * palabra propia de la consulta, no para sus sinónimos: «set» no trae
 * Kitty.
 */
const SHORT_FORM_FAMILIES: Record<string, string[]> = {
  kit: ["kitty"],
};

const colorGroupByLemma = new Map<string, string[]>();
for (const group of COLOR_GROUPS) {
  for (const lemma of group) colorGroupByLemma.set(stripAccents(lemma), group);
}

/**
 * El lema de un color, o null si la palabra no es un color conocido.
 * «rosadas» → «rosado», «amarilla» → «amarillo», «azules» → «azul»,
 * «grises» → «gris». Plural y género se pliegan aquí, no en la tabla.
 */
export function colorLemma(word: string): string | null {
  let w = stripAccents(word.trim().toLocaleLowerCase("es-CO"));
  if (!w) return null;
  const known = (candidate: string) => colorGroupByLemma.has(candidate);
  if (known(w)) return w;
  // Plural: «azules» → «azul», «marrones» → «marron», «rosadas» → «rosada».
  if (w.endsWith("es") && known(w.slice(0, -2))) return w.slice(0, -2);
  if (w.endsWith("s")) w = w.slice(0, -1);
  if (known(w)) return w;
  // Femenino: «rosada» → «rosado», «amarilla» → «amarillo».
  if (w.endsWith("a") && known(`${w.slice(0, -1)}o`)) return `${w.slice(0, -1)}o`;
  return null;
}

/** Los lemas del grupo de ese color: lo que hay que buscar en el catálogo. */
export function colorTerms(word: string): string[] {
  const lemma = colorLemma(word);
  return lemma ? [...(colorGroupByLemma.get(lemma) ?? [])] : [];
}

/**
 * Sinónimos por palabra, indexados por la palabra sin tildes y también por
 * su raíz de plural, para que «bolígrafos» y «libretas» encuentren su grupo.
 * Los colores entran como un grupo más: «rosada» se cambia por «rosa» y por
 * «rosado» igual que «libreta» se cambia por «cuaderno».
 */
const synonymsByWord = new Map<string, string[]>();
for (const group of [...SYNONYM_GROUPS, ...COLOR_GROUPS]) {
  for (const word of group) {
    const others = group.filter((other) => other !== word);
    for (const key of Array.from(new Set([stripAccents(word), stripAccents(pluralStem(word))]))) {
      if (!synonymsByWord.has(key)) synonymsByWord.set(key, others);
    }
  }
}

function synonymsOf(word: string): string[] {
  const lemma = colorLemma(word);
  if (lemma) {
    // Para un color, TODOS los lemas del grupo valen, incluido el propio:
    // «rosada» tiene que convertirse en «rosa» y en «rosado».
    return colorGroupByLemma.get(lemma) ?? [];
  }
  // Tres llaves: la palabra, su raíz de plural y la palabra sin la «s»
  // final. La tercera es por el «-es» ambiguo: la raíz de «totes» es «tot»,
  // pero su grupo está indexado por «tote».
  const plain = stripAccents(word);
  const candidatas = [plain, stripAccents(pluralStem(word))];
  if (plain.endsWith("s")) candidatas.push(plain.slice(0, -1));
  for (const key of candidatas) {
    const found = synonymsByWord.get(key);
    if (found) return found;
  }
  return [];
}

export function normalizeSearchTerm(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CO");
}

/**
 * Devuelve el término tal cual más sus variantes, sin duplicados y acotado.
 * Una consulta vacía devuelve una lista vacía.
 *
 * Las variantes son, en este orden: la frase como se escribió; la frase con
 * cada palabra reducida a su raíz de plural («cuadernos kuromi» → «cuaderno
 * kuromi», que sí está dentro de «Cuaderno Kuromi»); y, sobre cada una de
 * esas dos, la frase con una palabra cambiada por cada sinónimo o lema de
 * color («rosada» → «rosa», «rosado»). La búsqueda de la tienda sigue siendo
 * de frase entera: lo que cambia es que la frase ya no depende del número ni
 * del género con que la escribió la clienta.
 */
export function expandSearchTerms(query: string): string[] {
  const normalized = normalizeSearchTerm(query);
  if (!normalized) return [];

  const words = normalized.split(" ");
  const stemmed = words.map(pluralStem);
  // Las palabras en z van en las dos formas: «lápiz» busca también «lápices».
  const enCes = stemmed.map((w) => (/z$/.test(w) && w.length > 2 ? `${w.slice(0, -1)}ces` : w));
  const bases: string[][] = [words];
  for (const base of [stemmed, enCes]) {
    if (!bases.some((b) => b.join(" ") === base.join(" "))) bases.push(base);
  }

  const terms = new Set<string>(bases.map((base) => base.join(" ")));

  for (const base of bases) {
    base.forEach((word, index) => {
      for (const synonym of synonymsOf(word)) {
        if (terms.size >= MAX_TERMS) return;
        const variant = [...base];
        variant[index] = synonym;
        terms.add(variant.join(" "));
      }
    });
  }

  return Array.from(terms);
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

export function searchTokens(
  query: string,
  options: { minLength?: number } = {},
): string[] {
  const minLength = options.minLength ?? MIN_TOKEN_LENGTH;
  return normalizeSearchTerm(query)
    .split(" ")
    // Los signos pegados a la palabra («¿tienes» o «azul?») impedirían
    // reconocerla, tanto para descartarla como para buscarla. Solo en los
    // bordes: «0.5mm» es una medida y el punto es parte de ella.
    .map((word) => word.replace(/^[¿?¡!.,;:()"']+|[¿?¡!.,;:()"']+$/g, "").trim())
    .filter(
      (word) =>
        word.length >= minLength &&
        // Se compara sin tildes: la lista está sin ellas y la clienta escribe
        // «muéstrame», no «muestrame».
        !STOP_WORDS.has(stripAccents(word)),
    );
}

/**
 * En la tienda una palabra de dos letras sí distingue: «a5», «hb», «2b».
 * Por WhatsApp no (ahí «el», «ya», «ok» son ruido y ya están en la lista).
 */
const STORE_MIN_TOKEN_LENGTH = 2;

/**
 * Las formas con las que UNA palabra de la consulta se compara con un
 * nombre: la palabra, su raíz de plural (y el plural en «ces»), sus
 * sinónimos y los lemas de su color, cada uno con sus propias raíces.
 *
 * Se quitan las formas que otra más corta ya cubre: `contains("cuaderno")`
 * encuentra todo lo que encuentra `contains("cuadernos")`, así que la
 * segunda sobra. Menos condiciones, mismo resultado.
 */
export function nameForms(token: string): string[] {
  const formas = new Set<string>();
  const propia = normalizeSearchTerm(token);
  for (const palabra of [propia, ...synonymsOf(token)]) {
    formas.add(palabra);
    for (const forma of wordForms(palabra)) formas.add(forma);
  }
  for (const forma of [propia, ...wordForms(propia)]) {
    for (const familia of SHORT_FORM_FAMILIES[forma] ?? []) formas.add(familia);
  }
  return pruneSubsumed(Array.from(formas));
}

function pruneSubsumed(forms: string[]): string[] {
  const unicas = Array.from(new Set(forms.filter(Boolean)));
  return unicas.filter(
    (forma) =>
      !unicas.some(
        (otra) =>
          otra !== forma &&
          // Una forma corta se compara como palabra entera: no cubre nada.
          otra.length > SHORT_FORM_LENGTH &&
          forma.startsWith(otra),
      ),
  );
}

/**
 * La consulta de la tienda, palabra por palabra, con las formas de cada una.
 *
 * Antes la tienda buscaba la frase entera dentro del nombre: «cuadernos
 * kuromi» no encontraba «Cuaderno argollado Kuromi» porque las palabras no
 * iban seguidas. Ahora cada palabra significativa tiene que aparecer, en
 * alguna de sus formas, sin importar el orden ni lo que haya en medio. Es
 * MÁS exigente para dos palabras (las dos tienen que estar) y, para una,
 * lo mismo de antes más sus formas.
 *
 * Sin palabras significativas («de la») se busca la frase tal cual, como
 * siempre, para no devolver el catálogo entero.
 */
export function searchTokenForms(query: string): { token: string; forms: string[] }[] {
  const tokens = searchTokens(query, { minLength: STORE_MIN_TOKEN_LENGTH });
  if (tokens.length > 0) return tokens.map((token) => ({ token, forms: nameForms(token) }));
  const frase = normalizeSearchTerm(query);
  if (!frase) return [];
  const variantes = expandSearchTerms(frase);
  return [{ token: frase, forms: variantes.length ? variantes : [frase] }];
}

/**
 * Condiciones para un `AND`: una por palabra, cada una «el nombre contiene
 * alguna de sus formas». Vacío cuando no hay consulta.
 *
 * Va en `AND`, nunca en `OR`: en `OR` bastaría con que apareciera UNA palabra
 * y «cuaderno kuromi» devolvería todos los cuadernos y todo lo de Kuromi.
 */
export function productNameSearchConditions(query: string): Prisma.ProductWhereInput[] {
  return searchTokenForms(query).map(({ forms }) => ({
    OR: forms.map((form) => formCondition("name", form) as Prisma.ProductWhereInput),
  }));
}

export function productGroupNameSearchConditions(
  query: string,
): Prisma.ProductGroupWhereInput[] {
  return searchTokenForms(query).map(({ forms }) => ({
    OR: forms.map((form) => formCondition("name", form) as Prisma.ProductGroupWhereInput),
  }));
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
 * Las condiciones de UNA palabra: en el nombre (con sinónimos), en las
 * etiquetas del catálogo y, si se pide, en la descripción.
 *
 * Las etiquetas entraron por un fallo real: «tote bag de perrito» daba cero y
 * el bot contestó «no lo tengo» con el producto activo y con existencias,
 * porque «perrito» solo vivía en el diseño del producto, que nadie miraba.
 * Medido sobre los 867 productos activos, 456 tienen el diseño fuera del
 * nombre y la descripción, 520 el color y 575 la categoría.
 *
 * Todo se compara por la raíz de plural (`pluralStem`), que está dentro del
 * singular y del plural guardados. El color además se pliega a sus lemas
 * («amarilla» busca «amarillo»; «rosada», «rosa» y «rosado»). Categoría y
 * grupo llevan los sinónimos, porque nombran tipos de producto: «libreta»
 * tiene que dar con la categoría «Cuadernos». El diseño no: un personaje se
 * llama como se llama.
 */
function tokenWhere(
  token: string,
  options: { withDescription: boolean },
): Prisma.ProductWhereInput {
  const terminos = nameForms(token);
  const formas = wordForms(token);
  const raices = Array.from(new Set(terminos.flatMap(wordForms)));
  const colores = colorTerms(token);
  const raicesColor = colores.length ? colores : formas;
  return {
    OR: [
      ...terminos.map((term) => formCondition("name", term) as Prisma.ProductWhereInput),
      ...formas.map((f) => ({ design: { is: { name: { contains: f } } } })),
      ...raicesColor.map((c) => ({ color: { is: { name: { contains: c } } } })),
      ...raices.map((r) => ({ category: { is: { name: { contains: r } } } })),
      ...raices.map((r) => ({ productGroup: { is: { name: { contains: r } } } })),
      ...(options.withDescription
        ? formas.map((f) => formCondition("description", f) as Prisma.ProductWhereInput)
        : []),
    ],
  };
}
