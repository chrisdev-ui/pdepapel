import { foldWords } from "@/lib/season-calendar";

/**
 * Familias de líneas de producto (Type) que arman un kit con sentido. Un kit
 * solo junta líneas que comparten al menos una familia con todas las demás
 * piezas, así que un jabón no entra a un kit de journaling ni un plato a uno
 * de colores aunque alguna vez se hayan comprado juntos. Una línea que no está
 * aquí no entra a ningún kit (y la herramienta lo dice, para que una línea
 * nueva o renombrada se agregue a propósito).
 */
export type KitFamilies = Readonly<Record<string, readonly string[]>>;

export const KIT_FAMILIES: KitFamilies = {
  escolar: ["Cuadernos", "Escritura", "Útiles", "Lápices & Colores", "Oficina", "Carpetas", "Planeación & Organización"],
  creativo: ["Journal / Scrap", "Creatividad & Juego", "Lápices & Colores", "Escritura", "Lectura", "Cuadernos"],
  regalo: ["Accesorios", "Bolsos & Morrales", "Belleza / Cuidado Personal", "Lectura", "Cuadernos", "Journal / Scrap"],
};

const fold = (value: string) => foldWords(value).replace(/\s+/g, " ").trim();

/** Las familias de una línea, por su nombre. */
export function familiesOf(typeName: string | null, families: KitFamilies = KIT_FAMILIES): Set<string> {
  if (!typeName) return new Set();
  const name = fold(typeName);
  return new Set(Object.entries(families).filter(([, lines]) => lines.some((line) => fold(line) === name)).map(([family]) => family));
}

/** Una línea o categoría de kits («Kits», «Kits kawaii»): lo que vende es ya un kit, aunque no esté marcado como kit. */
export function isBundleLine(...names: (string | null)[]): boolean {
  return names.some((name) => name !== null && /^kits?\b/.test(fold(name)));
}
