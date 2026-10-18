/**
 * Piezas puras de las pantallas de Marcas del panel (sin base de datos), para
 * poder probarlas sin navegador.
 */

export const brandsApi = (storeId: string) => `/api/${storeId}/brands`;

/** Mueve el elemento `index` un puesto arriba (-1) o abajo (+1); en los extremos devuelve la lista igual. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Mismo orden de ids: no hay nada que guardar. */
export function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export type BrandFlag = "isVisible" | "isFeatured";

/**
 * Texto del aviso al cambiar un interruptor de la lista y el cuerpo que lo
 * deshace (el valor anterior).
 */
export function brandFlagToast(brandName: string, flag: BrandFlag, value: boolean) {
  const message =
    flag === "isVisible"
      ? value
        ? `${brandName} ya se ve en la tienda.`
        : `${brandName} ya no se ve en la tienda.`
      : value
        ? `${brandName} sale en «Compra por marca».`
        : `${brandName} ya no sale en «Compra por marca».`;
  return { message, undo: { [flag]: !value } as Partial<Record<BrandFlag, boolean>> };
}

/**
 * Transparencia del logo: lee el alfa de las cuatro esquinas (RGBA). Una
 * esquina opaca quiere decir que el archivo trae fondo.
 */
export function logoCornersHaveBackground(data: ArrayLike<number>, width: number, height: number) {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return false;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  return corners.some(([x, y]) => data[(y * width + x) * 4 + 3] === 255);
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

function foldChar(char: string) {
  return char.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-CO");
}

const isWordChar = (char: string | undefined) => Boolean(char) && /[a-z0-9]/.test(char as string);

/**
 * Parte el nombre para resaltar el término que coincidió (sin tildes ni
 * mayúsculas, como palabra completa): «Libreta KIUT cosida» con «Kiut».
 */
export function highlightTerm(text: string, term: string): HighlightSegment[] {
  const needle = Array.from(term.trim()).map(foldChar).join("");
  if (!text || !needle) return text ? [{ text, match: false }] : [];

  const chars = Array.from(text);
  let folded = "";
  const origin: number[] = [];
  chars.forEach((char, index) => {
    const value = foldChar(char);
    for (const piece of Array.from(value)) {
      folded += piece;
      origin.push(index);
    }
  });

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let from = 0;
  while (from <= folded.length - needle.length) {
    const at = folded.indexOf(needle, from);
    if (at === -1) break;
    const end = at + needle.length;
    if (isWordChar(folded[at - 1]) || isWordChar(folded[end])) {
      from = at + 1;
      continue;
    }
    const start = origin[at];
    const stop = origin[end - 1] + 1;
    if (start > cursor) segments.push({ text: chars.slice(cursor, start).join(""), match: false });
    segments.push({ text: chars.slice(start, stop).join(""), match: true });
    cursor = stop;
    from = end;
  }
  if (cursor < chars.length) segments.push({ text: chars.slice(cursor).join(""), match: false });
  return segments;
}

/** Estado de la casilla «Todos»: marcada, sin marcar o a medias. */
export function selectAllState(ids: readonly string[], selected: ReadonlySet<string>): boolean | "indeterminate" {
  if (ids.length === 0) return false;
  const count = ids.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === ids.length ? true : "indeterminate";
}

export const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/** Encabezado de las sugerencias: por el nombre o (algún) alias. */
export function suggestionsHeading(brandName: string, rows: { reason: string }[]) {
  const count = rows.length;
  const allByName = count > 0 && rows.every((row) => row.reason === "coincide por el nombre");
  const found = `Encontré ${plural(count, "producto", "productos")}`;
  return allByName ? `${found} que ${count === 1 ? "dice" : "dicen"} «${brandName}» en el nombre` : `${found} para ${brandName}`;
}

/** Las líneas de «Al fusionar:» antes de confirmar. */
export function mergeSummaryLines(
  source: { name: string; slug: string; productCount: number },
  target: { name: string; slug: string },
) {
  return [
    `${plural(source.productCount, "producto pasa", "productos pasan")} de ${source.name} a ${target.name}`,
    `${source.name} queda archivada`,
    `/marcas/${source.slug} redirige a /marcas/${target.slug}`,
    `Los alias de ${source.name} se suman a ${target.name} (y «${source.name}» queda como alias)`,
  ];
}

/** Solo se ofrece copiar el logo cuando A tiene y B no. */
export function canOfferLogoCopy(source: { logoUrl: string | null }, target: { logoUrl: string | null } | null) {
  return Boolean(source.logoUrl) && Boolean(target) && !target?.logoUrl;
}
