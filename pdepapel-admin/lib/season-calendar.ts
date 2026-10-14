/**
 * Fechas de venta en Colombia para una papelería: fijo, sin búsqueda en
 * internet. Las fechas móviles (día de la madre, del padre, del niño, amor y
 * amistad) se calculan por año. Las palabras sirven para ver si un producto
 * encaja en la ocasión (se comparan sin tildes ni mayúsculas, por raíz).
 */
export interface Occasion {
  id: string;
  nombre: string;
  /** El día de la ocasión en Bogotá, `yyyy-mm-dd`. */
  fecha: string;
  enDias: number;
  palabras: readonly string[];
}

interface OccasionRule {
  id: string;
  nombre: string;
  date: (year: number) => { month: number; day: number };
  palabras: readonly string[];
}

const SCHOOL = ["cuaderno", "lapiz", "lapicero", "esfero", "borrador", "sacapunta", "cartuchera", "estuche", "morral", "regla", "colores", "marcador", "resaltador", "carpeta", "agenda", "plastilina", "crayon", "tijera", "pegante", "cinta"];
const GIFT = ["regalo", "peluche", "taza", "mug", "tarjeta", "sticker", "llavero", "vela", "libreta", "washi", "caja", "bolsa", "termo", "agenda", "detalle"];

/** El enésimo `weekday` (0 = domingo) del mes; `n = -1` es el último. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return { month, day: 1 + ((weekday - first + 7) % 7) + (n - 1) * 7 };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return { month, day: lastDay - ((last - weekday + 7) % 7) };
}

const RULES: readonly OccasionRule[] = [
  { id: "regreso-a-clases-enero", nombre: "Regreso a clases (enero y febrero)", date: () => ({ month: 1, day: 20 }), palabras: SCHOOL },
  { id: "san-valentin", nombre: "San Valentín", date: () => ({ month: 2, day: 14 }), palabras: GIFT },
  { id: "dia-de-la-mujer", nombre: "Día de la mujer", date: () => ({ month: 3, day: 8 }), palabras: GIFT },
  { id: "dia-del-idioma", nombre: "Día del idioma y del libro", date: () => ({ month: 4, day: 23 }), palabras: ["libreta", "cuaderno", "separador", "marcapagina", "agenda", "libro", "esfero"] },
  { id: "dia-del-nino", nombre: "Día del niño", date: (year) => nthWeekday(year, 4, 6, -1), palabras: ["juguete", "bloque", "colores", "sticker", "plastilina", "crayon", "rompecabeza", "pintura", "libro para colorear", "peluche"] },
  { id: "dia-de-la-madre", nombre: "Día de la madre", date: (year) => nthWeekday(year, 5, 0, 2), palabras: GIFT },
  { id: "dia-del-maestro", nombre: "Día del maestro", date: () => ({ month: 5, day: 15 }), palabras: ["agenda", "planeador", "termo", "taza", "mug", "libreta", "esfero", "marcador", "sello", "sticker"] },
  { id: "dia-del-padre", nombre: "Día del padre", date: (year) => nthWeekday(year, 6, 0, 3), palabras: GIFT },
  { id: "regreso-a-clases-agosto", nombre: "Regreso a clases (calendario B)", date: () => ({ month: 8, day: 20 }), palabras: SCHOOL },
  { id: "amor-y-amistad", nombre: "Amor y Amistad", date: (year) => nthWeekday(year, 9, 6, 3), palabras: GIFT },
  { id: "halloween", nombre: "Halloween", date: () => ({ month: 10, day: 31 }), palabras: ["halloween", "calabaza", "bruja", "fantasma", "dulcero", "disfraz", "murcielago", "esqueleto", "sticker"] },
  { id: "grados", nombre: "Grados", date: () => ({ month: 11, day: 25 }), palabras: ["tarjeta", "libreta", "agenda", "regalo", "termo", "esfero"] },
  { id: "velitas", nombre: "Día de las velitas", date: () => ({ month: 12, day: 7 }), palabras: ["vela", "farol", "faroles"] },
  { id: "navidad", nombre: "Navidad", date: () => ({ month: 12, day: 24 }), palabras: ["navidad", "navideno", "regalo", "bolsa", "tarjeta", "papel regalo", "adorno", "sticker", "caja", "agenda"] },
];

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

/** Ocasiones de los próximos `withinDays` días (la de hoy incluida), de la más cercana a la más lejana. */
export function upcomingOccasions(now: Date, withinDays = 45): Occasion[] {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const found: Occasion[] = [];
  for (const year of [local.getUTCFullYear(), local.getUTCFullYear() + 1]) {
    for (const rule of RULES) {
      const { month, day } = rule.date(year);
      const enDias = Math.round((Date.UTC(year, month - 1, day) - today) / DAY_MS);
      if (enDias >= 0 && enDias <= withinDays) found.push({ id: rule.id, nombre: rule.nombre, fecha: `${year}-${pad(month)}-${pad(day)}`, enDias, palabras: rule.palabras });
    }
  }
  return found.sort((a, b) => a.enDias - b.enDias);
}

export const foldWords = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** ¿Algún texto (nombre, categoría, tipo) trae una de las palabras de la ocasión? */
export function matchesOccasion(texts: readonly (string | null | undefined)[], palabras: readonly string[]): boolean {
  const haystack = ` ${texts.filter(Boolean).map((text) => foldWords(text!)).join(" ")} `;
  return palabras.some((palabra) => haystack.includes(` ${palabra}`));
}

/** Usos de todo el año, para nombrar un kit cuando no hay ocasión cerca. */
export const EVERYDAY_USES: readonly { nombre: string; palabras: readonly string[] }[] = [
  { nombre: "Útiles escolares", palabras: SCHOOL },
  { nombre: "Oficina", palabras: ["carpeta", "archivador", "grapadora", "cosedora", "notas adhesivas", "post", "clip", "esfero", "agenda", "planeador", "folder", "sobre"] },
  { nombre: "Regalo", palabras: GIFT },
];
