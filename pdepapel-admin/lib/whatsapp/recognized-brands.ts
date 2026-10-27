import prismadb from "@/lib/prismadb";

/**
 * Las marcas que el bot de WhatsApp trata como «reconocidas» cuando la clienta
 * pide calidad. Es una lista corta y a mano, en un solo sitio: se edita aquí.
 *
 * Lista aprobada el 27 de octubre de 2026: las marcas de papelería conocidas
 * que ya tiene el catálogo, por campo de marca o por nombre. Una línea de
 * marca (Brand con padre) cuenta si su marca madre está en la lista.
 *
 * Las licencias de personajes (Stitch, Sanrio, Hello Kitty, Kuromi, Disney,
 * Pokémon) NO son señal de calidad y no van aquí. Gipao entró por decisión de
 * Paula (27 de octubre); Rosy Posy, Mycardcol y Formas Futuro quedan fuera
 * (calidad media, también decisión suya).
 *
 * Solo 70 de 891 productos tenían la marca puesta ese día, así que también se
 * reconoce por el NOMBRE del producto («Cuaderno Norma …»), al consultar y sin
 * escribir nada. Llenar el campo de marca es otra tarea, revisada por Paula.
 *
 * El bot nunca dice que algo es «el mejor» por estar aquí: solo lo enseña
 * antes, con un texto que dice «de marcas reconocidas».
 */
export const RECOGNIZED_BRANDS: readonly string[] = [
  "Norma",
  "Kiut",
  "Primavera",
  "Scribe",
  "Offi-Esco",
  "Klipp",
  "Crayola",
  "Incolors",
  "Grafi",
  "Kores",
  "Sharpie",
  "Tombow",
  "Mirado",
  "Studmark",
  "Gipao",
];

/** Minúsculas, sin tildes y con todo lo que no es letra o número como espacio. */
export const brandPhrase = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const RECONOCIDAS = new Set(RECOGNIZED_BRANDS.map(brandPhrase));

export interface BrandForRanking {
  name: string;
  parent?: { name: string } | null;
}

export function isRecognizedBrand(brand: BrandForRanking | null | undefined): boolean {
  if (!brand) return false;
  if (RECONOCIDAS.has(brandPhrase(brand.name))) return true;
  return Boolean(brand.parent && RECONOCIDAS.has(brandPhrase(brand.parent.name)));
}

/** Frases de marca reconocida (las de la lista y sus líneas) que aparecen en un nombre, palabra por palabra. */
export function recognizedBrandInName(productName: string, lineNames: readonly string[] = []): string | null {
  const nombre = ` ${brandPhrase(productName)} `;
  for (const marca of [...RECOGNIZED_BRANDS, ...lineNames]) {
    const frase = brandPhrase(marca);
    if (frase && nombre.includes(` ${frase} `)) return marca;
  }
  return null;
}

export type BrandSource = "field" | "name" | null;

/** De dónde sale la marca reconocida de un producto: su campo de marca, su nombre, o ninguna. */
export function recognizedBrandSource(
  product: { name: string; brandRef?: BrandForRanking | null },
  lineNames: readonly string[] = [],
): BrandSource {
  if (isRecognizedBrand(product.brandRef)) return "field";
  return recognizedBrandInName(product.name, lineNames) ? "name" : null;
}

const LINE_TTL_MS = 5 * 60 * 1000;
const lineCache = new Map<string, { at: number; names: string[] }>();

/**
 * Las líneas (Brand con padre) de una marca reconocida en esta tienda: «Flower
 * Power» cuenta si su marca madre está en la lista. Cinco minutos en memoria,
 * como el índice de términos del catálogo.
 */
export async function loadRecognizedLineNames(storeId: string): Promise<string[]> {
  const cached = lineCache.get(storeId);
  if (cached && Date.now() - cached.at < LINE_TTL_MS) return cached.names;
  const lines = await prismadb.brand.findMany({
    where: { storeId, isArchived: false, parentBrandId: { not: null } },
    select: { name: true, parent: { select: { name: true } } },
  });
  const names = lines.filter((l) => isRecognizedBrand(l)).map((l) => l.name);
  lineCache.set(storeId, { at: Date.now(), names });
  return names;
}

export function resetRecognizedLineCache(): void {
  lineCache.clear();
}
