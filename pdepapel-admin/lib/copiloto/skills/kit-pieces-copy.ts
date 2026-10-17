/**
 * El «Lo que amarás» de un kit habla de sus piezas reales: las nombra (por su
 * tipo o su nombre) y no menciona piezas, personajes ni marcas que no estén en
 * los nombres o categorías de ese kit. Sin dependencias de servidor.
 */

interface PieceLike {
  nombre: string;
  categoria?: string | null;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Tipos de pieza de papelería, con la forma en que se nombran en una frase y para qué sirven. */
const PIECE_TYPES: { key: string; pattern: RegExp; label: string; purpose: string }[] = [
  { key: "cuaderno", pattern: /\bcuadernos?\b/, label: "cuaderno", purpose: "para tus apuntes" },
  { key: "libreta", pattern: /\blibretas?\b/, label: "libreta", purpose: "para tus notas" },
  { key: "agenda", pattern: /\b(agendas?|planners?|planeador(es)?)\b/, label: "agenda", purpose: "para organizar tus días" },
  { key: "lapiz", pattern: /\b(lapiz|lapices)\b/, label: "lápiz", purpose: "para escribir o dibujar" },
  { key: "portaminas", pattern: /\bportaminas\b/, label: "portaminas", purpose: "para escribir con trazo fino" },
  { key: "lapicero", pattern: /\b(lapiceros?|boligrafos?|esferos?)\b/, label: "lapicero", purpose: "para escribir" },
  { key: "marcador", pattern: /\b(marcador(es)?|plumon(es)?)\b/, label: "marcador", purpose: "para dar color" },
  { key: "resaltador", pattern: /\bresaltador(es)?\b/, label: "resaltador", purpose: "para resaltar lo importante" },
  { key: "borrador", pattern: /\bborrador(es)?\b/, label: "borrador", purpose: "para corregir" },
  { key: "corrector", pattern: /\b(corrector(es)?|correctoras?)\b/, label: "corrector", purpose: "para corregir sin tachones" },
  { key: "regla", pattern: /\breglas?\b/, label: "regla", purpose: "para trazar líneas rectas" },
  { key: "colores", pattern: /\b(colores|crayon(es)?|crayolas?)\b/, label: "colores", purpose: "para colorear" },
  { key: "acuarela", pattern: /\b(acuarelas?|pincel(es)?|temperas?)\b/, label: "acuarela", purpose: "para pintar" },
  { key: "tijera", pattern: /\btijeras?\b/, label: "tijeras", purpose: "para recortar" },
  { key: "pegante", pattern: /\b(pegantes?|pegamentos?|colbon|silicona)\b/, label: "pegante", purpose: "para pegar" },
  { key: "sticker", pattern: /\b(stickers?|pegatinas?|calcomanias?)\b/, label: "stickers", purpose: "para decorar" },
  { key: "washi", pattern: /\bwashi\b/, label: "cinta washi", purpose: "para decorar" },
  { key: "carpeta", pattern: /\bcarpetas?\b/, label: "carpeta", purpose: "para guardar tus hojas" },
  { key: "estuche", pattern: /\b(estuches?|cartucheras?|lapiceras?)\b/, label: "estuche", purpose: "para llevar todo" },
  { key: "sacapuntas", pattern: /\b(sacapuntas|tajalapiz)\b/, label: "sacapuntas", purpose: "para sacarle punta" },
  { key: "notas", pattern: /\b(notas adhesivas|post-?its?|notitas)\b/, label: "notas adhesivas", purpose: "para tus recordatorios" },
  { key: "clip", pattern: /\bclips?\b/, label: "clips", purpose: "para sujetar hojas" },
  { key: "mochila", pattern: /\b(mochilas?|morral(es)?|maletas?)\b/, label: "mochila", purpose: "para llevar tus cosas" },
  { key: "termo", pattern: /\b(termos?|botilitos?|botellas?)\b/, label: "termo", purpose: "para tu bebida" },
];

const typesIn = (text: string) => PIECE_TYPES.filter((type) => type.pattern.test(fold(text))).map((type) => type.key);
const WORD = /[a-zñ0-9]+/g;
const STOP = new Set(["para", "con", "del", "los", "las", "una", "unos", "unas", "kit", "set", "pack", "tamano", "unidad", "unidades", "eval"]);
// Fechas y celebraciones se escriben con mayúscula sin ser personajes ni marcas.
const OCCASION_WORDS = new Set(["navidad", "halloween", "amor", "amistad", "madre", "padre", "mama", "papa", "maestro", "maestra", "grados", "velitas", "valentin", "mujer", "nino", "nina", "idioma", "colombia"]);
const words = (text: string) => (fold(text).match(WORD) ?? []).filter((word) => word.length >= 4 && !STOP.has(word));

/** Qué menciona cada pieza: sus tipos de papelería y las palabras propias de su nombre. */
function pieceVocabulary(piece: PieceLike) {
  const source = `${piece.nombre} ${piece.categoria ?? ""}`;
  return { types: new Set(typesIn(source)), words: new Set(words(source)) };
}

export interface PiecesCheck {
  /** Cuántas piezas distintas del kit nombran las frases. */
  piezasNombradas: number;
  /** Tipos de pieza o nombres propios que aparecen en las frases y no están en el kit. */
  inventado: string[];
}

export function checkPiecesCopy(bullets: readonly string[], pieces: readonly PieceLike[]): PiecesCheck {
  const text = bullets.join(" ");
  const vocab = pieces.map(pieceVocabulary);
  const kitTypes = new Set(vocab.flatMap((piece) => Array.from(piece.types)));
  const kitWords = new Set(vocab.flatMap((piece) => Array.from(piece.words)));
  const mentioned = new Set(typesIn(text));
  const bulletWords = new Set(words(text));
  const named = vocab.filter((piece) => Array.from(piece.types).some((type) => mentioned.has(type)) || Array.from(piece.words).some((word) => bulletWords.has(word))).length;
  const inventedTypes = Array.from(mentioned).filter((type) => !kitTypes.has(type));
  // Un nombre propio (personaje, marca) a mitad de frase tiene que venir de los nombres de las piezas.
  const properNouns = bullets.flatMap((bullet) =>
    Array.from(bullet.matchAll(/\s([A-ZÁÉÍÓÚÑ][a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]{2,})/g), (match) => match[1]).filter((word) => !kitWords.has(fold(word)) && !OCCASION_WORDS.has(fold(word)) && !typesIn(word).length),
  );
  return { piezasNombradas: named, inventado: [...inventedTypes, ...properNouns] };
}

/** Las frases del modelo sirven si nombran al menos dos piezas del kit (o la única que tenga) y no inventan nada. */
export function describesPieces(bullets: readonly string[], pieces: readonly PieceLike[]): boolean {
  if (!pieces.length) return false;
  const check = checkPiecesCopy(bullets, pieces);
  return check.piezasNombradas >= Math.min(2, pieces.length) && check.inventado.length === 0;
}

const joinWords = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

/** Texto base: cada pieza por su tipo y para qué sirve («Libreta para tus notas, lapicero para escribir y borrador para corregir»). Null si ninguna pieza tiene un tipo conocido. */
export function piecesPurposeBullet(pieces: readonly PieceLike[]): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const piece of pieces) {
    const found = [piece.nombre, piece.categoria ?? ""]
      .map((source) => {
        const type = PIECE_TYPES.find((candidate) => candidate.pattern.test(fold(source)));
        // La palabra tal como la trae el producto («Maleta», «Lápiz»), no la del tipo.
        const tokens = source.split(/\s+/);
        const at = type ? tokens.findIndex((token) => type.pattern.test(fold(token))) : -1;
        const word = at < 0 ? undefined : at > 0 && fold(tokens[at - 1]) === "cinta" ? `${tokens[at - 1]} ${tokens[at]}` : tokens[at];
        return type ? { type, word: (word ?? type.label).toLowerCase() } : null;
      })
      .find(Boolean);
    if (!found || seen.has(found.type.key)) continue;
    seen.add(found.type.key);
    parts.push(`${found.word} ${found.type.purpose}`);
  }
  if (!parts.length) return null;
  const sentence = joinWords(parts);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
