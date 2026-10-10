/**
 * Gramática de nombres (docs/plan-naming-productos.md §2): sustantivo canónico
 * por subcategoría, licencias que nunca son marca y ejemplos del estilo de la
 * tienda para el asistente de IA. Datos públicos del catálogo.
 */

/** Fotos que lee el asistente de IA por producto. */
export const MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES = 10;

export type CanonicalHeadNoun = { singular: string; plural: string };

const noun = (singular: string, plural: string): CanonicalHeadNoun => ({
  singular,
  plural,
});

/** Clave: nombre de la subcategoría normalizado (sin tildes, minúsculas, sin signos). */
export const CANONICAL_HEAD_NOUNS: Record<string, CanonicalHeadNoun> = {
  "accesorios de escritorio": noun(
    "Organizador de escritorio",
    "Organizadores de escritorio",
  ),
  "accesorios personales": noun("Accesorio", "Accesorios"),
  agendas: noun("Agenda", "Agendas"),
  alcancias: noun("Alcancía", "Alcancías"),
  antibacterial: noun("Gel antibacterial", "Geles antibacteriales"),
  archivadores: noun("Archivador", "Archivadores"),
  argollados: noun("Cuaderno argollado", "Cuadernos argollados"),
  "banderitas adhesivas": noun("Banderitas adhesivas", "Banderitas adhesivas"),
  bisturies: noun("Bisturí", "Bisturíes"),
  "blocks de hojas decorativas": noun(
    "Block de hojas decorativas",
    "Blocks de hojas decorativas",
  ),
  "blocks de papel": noun("Block de papel", "Blocks de papel"),
  "bloques de construccion": noun(
    "Bloques de construcción",
    "Bloques de construcción",
  ),
  "boligrafos lapiceros": noun("Lapicero", "Lapiceros"),
  "bolsas de agua termica": noun(
    "Bolsa de agua térmica",
    "Bolsas de agua térmica",
  ),
  "bolsos pequenos": noun("Bolso", "Bolsos"),
  borradores: noun("Borrador", "Borradores"),
  "brillos balsamos": noun("Brillo labial", "Brillos labiales"),
  calculadoras: noun("Calculadora", "Calculadoras"),
  calendarios: noun("Calendario", "Calendarios"),
  carpetas: noun("Carpeta", "Carpetas"),
  cartucheras: noun("Cartuchera", "Cartucheras"),
  cartulinas: noun("Cartulina", "Cartulinas"),
  "cenefas decorativas": noun("Cenefa decorativa", "Cenefas decorativas"),
  cepillos: noun("Cepillo", "Cepillos"),
  cinta: noun("Cinta", "Cintas"),
  "cintas resaltadoras": noun("Cinta resaltadora", "Cintas resaltadoras"),
  clips: noun("Clips", "Clips"),
  colores: noun("Colores", "Colores"),
  correctores: noun("Corrector", "Correctores"),
  cosidos: noun("Cuaderno cosido", "Cuadernos cosidos"),
  crayones: noun("Crayones", "Crayones"),
  "cuadernos de lettering": noun(
    "Cuaderno de lettering",
    "Cuadernos de lettering",
  ),
  "cuadros de piedras": noun("Cuadro de piedras", "Cuadros de piedras"),
  "diario devocional": noun("Diario devocional", "Diarios devocionales"),
  "empaques para regalo": noun("Empaque para regalo", "Empaques para regalo"),
  escarcha: noun("Escarcha", "Escarchas"),
  espejos: noun("Espejo", "Espejos"),
  folder: noun("Folder", "Folders"),
  guillotinas: noun("Guillotina", "Guillotinas"),
  "herramientas de oficina": noun(
    "Herramienta de oficina",
    "Herramientas de oficina",
  ),
  "hojas de origami": noun("Hojas de origami", "Hojas de origami"),
  "hojas de repuesto": noun("Hojas de repuesto", "Hojas de repuesto"),
  "jabon en petalos": noun("Jabón en pétalos", "Jabones en pétalos"),
  "juegos de sticker room": noun("Sticker room", "Sticker rooms"),
  "juegos geometricos": noun("Juego geométrico", "Juegos geométricos"),
  "kits de journal scrap": noun("Kit de journal", "Kits de journal"),
  "kits de lectura": noun("Kit de lectura", "Kits de lectura"),
  "kits de oficina": noun("Kit de oficina", "Kits de oficina"),
  "kits escolares": noun("Kit escolar", "Kits escolares"),
  "kits kawaii": noun("Kit kawaii", "Kits kawaii"),
  "kits para regalar o regalarse": noun("Kit de regalo", "Kits de regalo"),
  "kits sorpresa": noun("Kit sorpresa", "Kits sorpresa"),
  "kits universitarios": noun("Kit universitario", "Kits universitarios"),
  lamparas: noun("Lámpara", "Lámparas"),
  lapices: noun("Lápiz", "Lápices"),
  libretas: noun("Libreta", "Libretas"),
  "libros de colorear": noun("Libro para colorear", "Libros para colorear"),
  llaveros: noun("Llavero", "Llaveros"),
  loncheras: noun("Lonchera", "Loncheras"),
  "maletas morrales": noun("Morral", "Morrales"),
  marcadores: noun("Marcador", "Marcadores"),
  micropuntas: noun("Micropunta", "Micropuntas"),
  minas: noun("Minas", "Minas"),
  "monas pinzas": noun("Moña", "Moñas"),
  monederos: noun("Monedero", "Monederos"),
  mugs: noun("Mug", "Mugs"),
  multimaterias: noun("Cuaderno multimateria", "Cuadernos multimateria"),
  "notas adhesivas": noun("Notas adhesivas", "Notas adhesivas"),
  organizadores: noun("Organizador", "Organizadores"),
  panitos: noun("Pañitos", "Pañitos"),
  papeles: noun("Papel", "Papeles"),
  pegante: noun("Pegante", "Pegantes"),
  pines: noun("Pin", "Pines"),
  "pintar con numeros": noun("Pintura por números", "Pinturas por números"),
  pinturas: noun("Pintura", "Pinturas"),
  planeadores: noun("Planeador", "Planeadores"),
  planilleros: noun("Planillero", "Planilleros"),
  plastilina: noun("Plastilina", "Plastilinas"),
  plumigrafos: noun("Plumígrafo", "Plumígrafos"),
  plumones: noun("Plumón", "Plumones"),
  "porta carnets": noun("Portacarnet", "Portacarnets"),
  portaminas: noun("Portaminas", "Portaminas"),
  "protector de cargador": noun(
    "Protector de cargador",
    "Protectores de cargador",
  ),
  rapidografos: noun("Rapidógrafo", "Rapidógrafos"),
  reglas: noun("Regla", "Reglas"),
  resaltadores: noun("Resaltador", "Resaltadores"),
  resmas: noun("Resma", "Resmas"),
  sacapuntas: noun("Tajalápiz", "Tajalápices"),
  "sellos de lectura": noun("Sello de lectura", "Sellos de lectura"),
  "sellos decorativos": noun("Sello decorativo", "Sellos decorativos"),
  "sellos escolares": noun("Sello escolar", "Sellos escolares"),
  "separadores de paginas": noun(
    "Separador de páginas",
    "Separadores de páginas",
  ),
  "set de notas planner sticky notes": noun(
    "Set de notas adhesivas",
    "Sets de notas adhesivas",
  ),
  "sketchbook bitacora": noun("Sketchbook", "Sketchbooks"),
  sobres: noun("Sobre", "Sobres"),
  "sobres plasticos": noun("Sobre plástico", "Sobres plásticos"),
  sombrillas: noun("Sombrilla", "Sombrillas"),
  squishy: noun("Squishy", "Squishies"),
  stickers: noun("Stickers", "Stickers"),
  straps: noun("Strap", "Straps"),
  "tableros borrables": noun("Tablero borrable", "Tableros borrables"),
  termos: noun("Termo", "Termos"),
  tijeras: noun("Tijeras", "Tijeras"),
  toallas: noun("Toalla", "Toallas"),
  troqueles: noun("Troquel", "Troqueles"),
  vasos: noun("Vaso", "Vasos"),
  "washi tape": noun("Washi tape", "Washi tapes"),
};

/**
 * Otras formas de llamar el mismo tipo de producto, apuntando a la clave de su
 * subcategoría. Sirven para no confundir un sinónimo con un cambio de tipo.
 */
export const HEAD_NOUN_SYNONYMS: (CanonicalHeadNoun & {
  categoryKey: string;
})[] = [
  { categoryKey: "boligrafos lapiceros", ...noun("Bolígrafo", "Bolígrafos") },
  { categoryKey: "boligrafos lapiceros", ...noun("Esfero", "Esferos") },
  { categoryKey: "sacapuntas", ...noun("Sacapuntas", "Sacapuntas") },
  { categoryKey: "pegante", ...noun("Pegamento", "Pegamentos") },
  { categoryKey: "marcadores", ...noun("Rotulador", "Rotuladores") },
  {
    categoryKey: "colores",
    ...noun("Lápices de colores", "Lápices de colores"),
  },
  { categoryKey: "planeadores", ...noun("Planificador", "Planificadores") },
];

/**
 * Licencias y líneas de diseño: van en diseño, nunca en marca (plan §2.3 y
 * ejecucion-naming B1). Con su grafía oficial.
 */
export const LICENCE_NAMES = [
  "Sanrio",
  "Hello Kitty",
  "Kuromi",
  "My Melody",
  "Cinnamoroll",
  "Pompompurin",
  "Pochacco",
  "Badtz-Maru",
  "Keroppi",
  "Stitch",
  "Disney",
  "Mickey Mouse",
  "Minnie Mouse",
  "Snoopy",
  "Peanuts",
  "Mafalda",
  "Harry Potter",
  "El Principito",
  "One Piece",
  "Pokémon",
  "Marvel",
  "Doraemon",
  "Sailor Moon",
  "Barbie",
  "BTS",
  "Studio Ghibli",
  "Totoro",
  "Flower Power",
  "William Morris",
  "Van Gogh",
] as const;

/** Cómo se escribe cada marca de fabricante cuando la grafía no es Title Case simple. */
export const BRAND_SPELLINGS: Record<string, string> = {
  "faber castell": "Faber-Castell",
  "offi esco": "Offi-Esco",
};

/**
 * Ejemplos del estilo de la tienda para el asistente. Cumplen la gramática:
 * ≤60 caracteres, marca en Title Case, «N colores/diseños» si el empaque
 * mezcla y «xN» si las unidades son iguales.
 */
export const PRODUCT_NAME_EXAMPLES = [
  "Set de marcadores acrílicos Gipao punta pincel 12 colores",
  "Set de plumones Scribe punta delgada 24 colores",
  "Cuaderno argollado Norma 5 materias cuadriculado grande",
  "Lapicero semi gel Offi-Esco con aroma x10",
  "Pin decorativo metálico diseño Gatito kawaii",
  "Mug cerámico kawaii tonos pastel diseño Gatito 350 ml",
  "Clips decorativos metálicos Corazones palo de rosa x12",
  "Borrador de nata con aplique Conejito lila",
  "Agenda A5 Simple Life tapa acolchada rosa pastel",
  "Stickers en lámina Hello Kitty 6 diseños",
] as const;

/** Adjetivos de venta: ruido sin búsqueda (plan §2.3). Nunca en nombres ni al abrir una descripción. */
export const SALES_ADJECTIVES = [
  "lindo",
  "linda",
  "lindos",
  "lindas",
  "hermoso",
  "hermosa",
  "hermosos",
  "hermosas",
  "increíble",
  "increíbles",
  "espectacular",
  "espectaculares",
  "maravilloso",
  "maravillosa",
  "precioso",
  "preciosa",
  "super",
  "súper",
  "divino",
  "divina",
] as const;
