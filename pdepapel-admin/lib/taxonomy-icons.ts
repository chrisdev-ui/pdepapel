/**
 * Iconos de las categorías (modelo `Type`).
 *
 * Una categoría tiene, en este orden de prioridad: un icono propio generado
 * con IA (`iconSvg`, trazos saneados por `lib/svg-icon.ts`), un nombre de
 * icono de Lucide en kebab-case (`icon`) o, si no tiene ninguno, el icono
 * que la tienda deduce por palabra clave del slug/nombre. El nombre de la
 * categoría nunca lleva emoji: la API lo recorta al guardar.
 *
 * Este módulo es puro (sin React ni `lucide-react`) para que lo usen la API,
 * el selector de iconos y las pruebas.
 */

export interface CuratedTaxonomyIcon {
  /** Nombre de Lucide en kebab-case (`notebook-pen`). */
  name: string;
  /** Etiqueta corta en español que se ve bajo la casilla. */
  label: string;
  /** Palabras en español con las que se encuentra al buscar. */
  keywords: string[];
}

/** Patrón de un nombre de icono de Lucide. La API no valida contra la lista completa. */
export const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9-]{2,32}$/;

export function isLucideIconName(value: unknown): value is string {
  return typeof value === "string" && LUCIDE_ICON_NAME_PATTERN.test(value);
}

/** Los 15 iconos que la tienda ya conoce por palabra clave, más `tag` como neutro. */
export const CURATED_TAXONOMY_ICONS: readonly CuratedTaxonomyIcon[] = [
  { name: "pencil", label: "Lápices", keywords: ["lapiz", "lapices", "colores", "dibujo"] },
  { name: "pen-line", label: "Escritura", keywords: ["escritura", "pluma", "boligrafo", "esfero", "marcador"] },
  { name: "notebook-pen", label: "Cuadernos", keywords: ["cuaderno", "libreta", "agenda", "notas"] },
  { name: "sticker", label: "Stickers", keywords: ["sticker", "pegatina", "calcomania", "journal", "scrap"] },
  { name: "calendar-days", label: "Planeación", keywords: ["planeacion", "planeador", "organizacion", "calendario", "agenda"] },
  { name: "paperclip", label: "Útiles", keywords: ["utiles", "clip", "oficina", "escolar"] },
  { name: "gift", label: "Regalos", keywords: ["regalo", "kit", "detalle", "sorpresa"] },
  { name: "sparkles", label: "Accesorios", keywords: ["accesorio", "brillo", "kawaii", "lindo"] },
  { name: "backpack", label: "Bolsos", keywords: ["bolso", "morral", "mochila", "maleta", "cartuchera"] },
  { name: "folder", label: "Carpetas", keywords: ["carpeta", "archivador", "folder", "sobre"] },
  { name: "briefcase", label: "Oficina", keywords: ["oficina", "trabajo", "maletin"] },
  { name: "book-open", label: "Lectura", keywords: ["libro", "lectura", "leer", "cuento"] },
  { name: "palette", label: "Creatividad", keywords: ["creatividad", "arte", "pintura", "manualidades", "juego"] },
  { name: "flower", label: "Belleza", keywords: ["belleza", "cuidado", "flor", "personal"] },
  { name: "scissors", label: "Manualidades", keywords: ["tijeras", "cortar", "manualidades", "papeleria"] },
  { name: "tag", label: "Etiqueta", keywords: ["etiqueta", "general", "otros", "neutro"] },
];

/**
 * Palabra clave → icono de Lucide, igual que `TYPE_ICONS` en la tienda
 * (`pdepapel-store/lib/type-icons.tsx`). Es el respaldo cuando la categoría
 * no tiene icono guardado; mantener las dos listas sincronizadas.
 */
export const TYPE_ICON_KEYWORDS: Record<string, string> = {
  cuadernos: "notebook-pen",
  escritura: "pen-line",
  lapices: "pencil",
  journal: "sticker",
  scrap: "sticker",
  planeacion: "calendar-days",
  organizacion: "calendar-days",
  utiles: "paperclip",
  kits: "gift",
  accesorios: "sparkles",
  bolsos: "backpack",
  morrales: "backpack",
  carpetas: "folder",
  oficina: "briefcase",
  lectura: "book-open",
  creatividad: "palette",
  juego: "palette",
  belleza: "flower",
  cuidado: "flower",
};

export const DEFAULT_TAXONOMY_ICON = "tag";

/** Quita acentos, pasa a minúsculas y compacta espacios para comparar texto. */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recorta un emoji o símbolo inicial del nombre (versión pura, sin depender de la API). */
export function stripLeadingSymbol(name: string | null | undefined): string {
  return (name ?? "").replace(/^[^A-Za-z0-9À-ɏ]+/, "").trim();
}

/**
 * Nombre de icono de Lucide para una categoría sin `icon` guardado: mismo
 * criterio de palabra clave que la tienda. Devuelve `tag` si nada coincide.
 */
export function resolveFallbackIconName(type: {
  slug?: string | null;
  name?: string | null;
}): string {
  const haystack = normalizeSearchText(`${type.slug ?? ""} ${stripLeadingSymbol(type.name)}`);
  for (const [keyword, icon] of Object.entries(TYPE_ICON_KEYWORDS)) {
    if (haystack.includes(keyword)) return icon;
  }
  return DEFAULT_TAXONOMY_ICON;
}

/**
 * Diccionario español → términos en inglés con los que Lucide nombra sus
 * iconos. Cubre papelería, regalos y conceptos que una categoría de la tienda
 * suele necesitar; las claves van sin acentos.
 */
export const SPANISH_ICON_SYNONYMS: Record<string, string[]> = {
  tijeras: ["scissors"],
  tijera: ["scissors"],
  regalo: ["gift"],
  regalos: ["gift"],
  bolso: ["handbag", "backpack", "shopping-bag"],
  bolsos: ["handbag", "backpack"],
  mochila: ["backpack"],
  morral: ["backpack"],
  maleta: ["luggage", "briefcase"],
  maletin: ["briefcase"],
  cartuchera: ["pencil-ruler", "pen-tool"],
  libro: ["book"],
  libros: ["book", "library"],
  cuaderno: ["notebook"],
  libreta: ["notebook", "notepad-text"],
  agenda: ["notebook", "calendar", "book-open-check"],
  lapiz: ["pencil"],
  lapices: ["pencil"],
  pluma: ["pen", "feather"],
  boligrafo: ["pen"],
  esfero: ["pen"],
  marcador: ["highlighter", "pen-line"],
  resaltador: ["highlighter"],
  borrador: ["eraser"],
  carpeta: ["folder"],
  carpetas: ["folder"],
  archivador: ["folder-archive", "archive"],
  calendario: ["calendar"],
  planeador: ["calendar", "list-todo"],
  corazon: ["heart"],
  estrella: ["star"],
  flor: ["flower"],
  flores: ["flower"],
  cinta: ["ribbon"],
  lazo: ["ribbon"],
  sello: ["stamp"],
  sellos: ["stamp"],
  etiqueta: ["tag"],
  etiquetas: ["tags"],
  caja: ["box", "package"],
  cajas: ["box", "package"],
  paquete: ["package"],
  brillo: ["sparkles", "sparkle"],
  brillos: ["sparkles"],
  pegatina: ["sticker"],
  pegatinas: ["sticker"],
  sticker: ["sticker"],
  pintura: ["palette", "brush", "paintbrush"],
  pincel: ["brush", "paintbrush"],
  arte: ["palette", "brush"],
  manualidades: ["scissors", "palette"],
  papel: ["file", "sticky-note", "scroll"],
  hoja: ["file", "leaf"],
  nota: ["sticky-note", "notepad-text"],
  notas: ["sticky-note", "notepad-text"],
  clip: ["paperclip"],
  clips: ["paperclip"],
  grapadora: ["paperclip"],
  regla: ["ruler"],
  compas: ["compass"],
  calculadora: ["calculator"],
  oficina: ["briefcase", "building"],
  escritorio: ["lamp-desk", "monitor"],
  escuela: ["school", "graduation-cap"],
  escolar: ["school", "backpack"],
  universidad: ["graduation-cap"],
  juego: ["gamepad", "dice-5", "puzzle"],
  juguete: ["toy-brick", "baby"],
  rompecabezas: ["puzzle"],
  musica: ["music"],
  camara: ["camera"],
  foto: ["camera", "image"],
  taza: ["coffee", "cup-soda"],
  cafe: ["coffee"],
  dulce: ["candy", "cake"],
  torta: ["cake"],
  fiesta: ["party-popper"],
  cumpleanos: ["cake", "party-popper"],
  navidad: ["gift", "tree-pine", "snowflake"],
  amor: ["heart"],
  luna: ["moon"],
  sol: ["sun"],
  nube: ["cloud"],
  arcoiris: ["rainbow"],
  gato: ["cat"],
  perro: ["dog"],
  conejo: ["rabbit"],
  oso: ["paw-print"],
  llave: ["key"],
  llavero: ["key-round"],
  reloj: ["clock", "watch"],
  lampara: ["lamp"],
  vela: ["flame"],
  belleza: ["flower", "sparkles"],
  cuidado: ["heart-handshake", "flower"],
  ropa: ["shirt"],
  camiseta: ["shirt"],
  zapato: ["footprints"],
  tecnologia: ["smartphone", "laptop", "cable"],
  celular: ["smartphone"],
  audifonos: ["headphones"],
  cable: ["cable"],
  hogar: ["home", "house"],
  casa: ["home", "house"],
  cocina: ["cooking-pot", "utensils"],
  planta: ["sprout", "leaf"],
  mundo: ["globe"],
  viaje: ["plane", "map"],
  mapa: ["map"],
  bebe: ["baby"],
  nina: ["baby"],
  nino: ["baby"],
  mascota: ["paw-print"],
  huella: ["paw-print"],
  corona: ["crown"],
  magia: ["wand-sparkles", "sparkles"],
  varita: ["wand", "wand-sparkles"],
  tienda: ["store", "shopping-bag"],
  compras: ["shopping-cart", "shopping-bag"],
  dinero: ["banknote", "coins"],
  medalla: ["medal", "award"],
  premio: ["award", "trophy"],
  trofeo: ["trophy"],
  bandera: ["flag"],
  globo: ["globe"],
  cohete: ["rocket"],
  bombillo: ["lightbulb"],
  idea: ["lightbulb"],
  carta: ["mail", "mail-open"],
  sobre: ["mail"],
  correo: ["mail"],
  imprimir: ["printer"],
  impresora: ["printer"],
  candado: ["lock"],
  paraguas: ["umbrella"],
  bicicleta: ["bike"],
  carro: ["car"],
  avion: ["plane"],
  tren: ["train-front"],
  barco: ["ship", "sailboat"],
  pescado: ["fish"],
  pez: ["fish"],
  pajaro: ["bird"],
  mariposa: ["bug"],
  insecto: ["bug"],
  helado: ["ice-cream-cone"],
  pizza: ["pizza"],
  fruta: ["apple", "cherry"],
  manzana: ["apple"],
  cereza: ["cherry"],
  fresa: ["cherry"],
  hongo: ["sprout"],
  fantasma: ["ghost"],
  calavera: ["skull"],
  diamante: ["gem", "diamond"],
  gema: ["gem"],
  anillo: ["circle"],
  circulo: ["circle"],
  cuadrado: ["square"],
  triangulo: ["triangle"],
  hexagono: ["hexagon"],
  mas: ["plus"],
  menos: ["minus"],
  check: ["check"],
  listo: ["check"],
  lista: ["list", "list-todo", "list-checks"],
  tareas: ["list-todo", "list-checks"],
  favorito: ["star", "heart"],
  favoritos: ["star", "heart"],
  nuevo: ["sparkles", "badge-plus"],
  oferta: ["percent", "badge-percent"],
  descuento: ["percent", "badge-percent"],
  porcentaje: ["percent"],
  envio: ["truck", "package"],
  usuario: ["user"],
  persona: ["user"],
  personas: ["users"],
  configuracion: ["settings"],
  ajustes: ["settings"],
  buscar: ["search"],
  lupa: ["search"],
};

export const ICON_SEARCH_LIMIT = 48;

interface ScoredIcon {
  name: string;
  score: number;
}

function expandTerms(word: string): string[] {
  const terms = new Set<string>([word]);
  for (const [spanish, english] of Object.entries(SPANISH_ICON_SYNONYMS)) {
    const matches =
      spanish === word ||
      (word.length >= 3 && spanish.startsWith(word)) ||
      (spanish.length >= 3 && word.startsWith(spanish) && word.length - spanish.length <= 2);
    if (matches) english.forEach((term) => terms.add(term));
  }
  return Array.from(terms);
}

function scoreName(name: string, terms: string[]): number | null {
  let best: number | null = null;
  const segments = name.split("-");
  for (const term of terms) {
    let score: number | null = null;
    if (name === term) score = 0;
    else if (name.startsWith(term)) score = 1;
    else if (segments.some((segment) => segment.startsWith(term))) score = 2;
    else if (name.includes(term)) score = 3;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

/**
 * Busca iconos por nombre de Lucide o por palabra en español (sinónimos y
 * etiquetas de la lista curada). Insensible a mayúsculas y acentos; devuelve
 * como máximo `limit` nombres, los mejores primero.
 */
export function searchIconNames(
  query: string,
  names: readonly string[],
  limit = ICON_SEARCH_LIMIT,
): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const words = normalized.split(" ").filter(Boolean);
  const terms = Array.from(new Set(words.flatMap(expandTerms)));

  const scored = new Map<string, number>();
  for (const curated of CURATED_TAXONOMY_ICONS) {
    const haystack = normalizeSearchText(`${curated.label} ${curated.keywords.join(" ")}`);
    if (words.some((word) => haystack.includes(word))) scored.set(curated.name, -1);
  }
  for (const name of names) {
    const score = scoreName(name, terms);
    if (score === null) continue;
    const previous = scored.get(name);
    if (previous === undefined || score < previous) scored.set(name, score);
  }

  const results: ScoredIcon[] = Array.from(scored, ([name, score]) => ({ name, score }));
  results.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return results.slice(0, limit).map((item) => item.name);
}

export type TaxonomyIconBodyResult =
  | { ok: true; icon: string | null | undefined; iconSvg: string | null | undefined }
  | { ok: false; message: string };

/**
 * Normaliza `icon`/`iconSvg` del cuerpo de POST/PATCH de categorías.
 * `undefined` significa «no vino en el cuerpo» (conservar lo guardado);
 * `null` significa «quitar». `sanitize` es `sanitizeIconSvg` de
 * `lib/svg-icon.ts`, inyectado para mantener este módulo sin dependencias.
 */
export function parseTaxonomyIconBody(
  body: { icon?: unknown; iconSvg?: unknown },
  sanitize: (markup: string) => string | null,
): TaxonomyIconBodyResult {
  let icon: string | null | undefined;
  if (body.icon === undefined) icon = undefined;
  else if (body.icon === null || body.icon === "") icon = null;
  else if (typeof body.icon !== "string") return { ok: false, message: "El icono debe ser un nombre de icono de Lucide" };
  else {
    const normalized = body.icon.trim().toLowerCase();
    if (!normalized) icon = null;
    else if (!isLucideIconName(normalized)) {
      return { ok: false, message: "El icono debe ser un nombre de Lucide en minúsculas y guiones (por ejemplo, notebook-pen)" };
    } else icon = normalized;
  }

  let iconSvg: string | null | undefined;
  if (body.iconSvg === undefined) iconSvg = undefined;
  else if (body.iconSvg === null || body.iconSvg === "") iconSvg = null;
  else if (typeof body.iconSvg !== "string") return { ok: false, message: "El icono propio debe ser texto SVG" };
  else {
    const safe = sanitize(body.iconSvg);
    if (!safe) return { ok: false, message: "El icono propio no es válido: solo se aceptan trazos en el estilo de Lucide" };
    iconSvg = safe;
  }

  return { ok: true, icon, iconSvg };
}
