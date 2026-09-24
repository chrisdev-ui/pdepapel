/**
 * Reglas del formulario de grupo que no dependen de React: el estado en la
 * tienda de las variantes (tri-estado), el borrador que se guarda en el
 * navegador y las fotos marcadas para quitar.
 */

export type GroupArchiveMode = "per-variant" | "all-archived" | "all-published";

export interface ArchiveRow {
  id?: string;
  isArchived?: boolean;
}

/**
 * Qué muestra el control «Estado en la tienda» al abrir el grupo. Antes la
 * casilla leía solo la primera variante y mandaba un booleano que pisaba a
 * todas al guardar. Con filas mixtas el estado es «por variante».
 */
export function deriveArchiveMode(rows: ArchiveRow[]): GroupArchiveMode {
  const saved = rows.filter((row) => row.id);
  if (saved.length === 0) return "all-published";
  const archived = saved.filter((row) => row.isArchived === true).length;
  if (archived === 0) return "all-published";
  if (archived === saved.length) return "all-archived";
  return "per-variant";
}

/** Lo que viaja al servidor: booleano solo cuando se eligió «todas». */
export function archivePayload(mode: GroupArchiveMode): { isArchived?: boolean } {
  if (mode === "all-archived") return { isArchived: true };
  if (mode === "all-published") return { isArchived: false };
  return {};
}

/** Resumen humano para el control. */
export function describeArchiveRows(rows: ArchiveRow[]) {
  const saved = rows.filter((row) => row.id);
  const archived = saved.filter((row) => row.isArchived === true).length;
  const live = saved.length - archived;
  return { saved: saved.length, archived, live };
}

/**
 * El borrador de «Nuevo grupo» restauraba filas con `id` de productos
 * traídos días atrás, y al guardar los adoptaba (o los robaba de otro
 * grupo) sin que Paula los hubiera elegido esta vez. Solo se guardan las
 * filas generadas; las traídas se vuelven a traer.
 */
export function stripAdoptedRowsFromDraft<T extends { variants?: ArchiveRow[] }>(
  draft: T,
): { draft: T; dropped: number } {
  const variants = draft.variants ?? [];
  const kept = variants.filter((row) => !row.id);
  return {
    draft: { ...draft, variants: kept },
    dropped: variants.length - kept.length,
  };
}

/** Fotos del grupo que sobreviven al guardado (las marcadas se quitan). */
export function applyPendingImageRemovals<T extends { url: string }>(
  images: T[],
  pendingRemovals: string[],
) {
  if (pendingRemovals.length === 0) return images;
  const pending = new Set(pendingRemovals);
  return images.filter((image) => !pending.has(image.url));
}

/**
 * Fotos del grupo que nadie repartió: ni a una variante ni, a propósito, a
 * todas.
 *
 * El bloque «Reparto por variante» vive en el paso 1 y solo aparece cuando ya
 * hay colores o diseños elegidos, que se eligen en el paso 2, más abajo en la
 * misma página. En un grupo nuevo el orden real es: subo las fotos (todavía
 * sin colores, así que el bloque no está), bajo, elijo colores y diseños, y
 * guardo sin haber vuelto a subir. El bloque ya existía para entonces, pero
 * queda por encima de donde se está mirando, así que no se ve.
 *
 * Y una foto sin entrada en el reparto no es «sin decidir» para el servidor:
 * `resolveVariantImages` la trata igual que un «todas» explícito, así que se
 * copia a todas las variantes. De ahí el «se repartieron solas» de Paula.
 *
 * Esto NO opina sobre el reparto: solo dice qué fotos nadie tocó. Una entrada
 * con `scope: "all"` puesta a mano es una decisión válida y no sale aquí.
 */
export function findUnassignedGroupImages(
  images: { url: string }[],
  mapping: { url: string; scope: string }[] | undefined,
): string[] {
  const repartidas = new Set((mapping ?? []).map((entry) => entry.url));
  return images.map((image) => image.url).filter((url) => !repartidas.has(url));
}

/**
 * ¿Hay que frenar el guardado?
 *
 * Solo con dos condiciones a la vez: que el grupo vaya a quedar con más de
 * una variante —con una sola no hay nada que repartir— y que quede alguna
 * foto sin tocar. Se mira el número de variantes de verdad, no cuántos
 * colores y diseños se marcaron: un color por un diseño sigue siendo una
 * variante.
 */
export function shouldBlockForUnassignedImages(
  images: { url: string }[],
  mapping: { url: string; scope: string }[] | undefined,
  variantCount: number,
): { block: boolean; missing: string[] } {
  if (variantCount <= 1) return { block: false, missing: [] };
  const missing = findUnassignedGroupImages(images, mapping);
  return { block: missing.length > 0, missing };
}

export interface GeneratedCombination {
  sizeId: string;
  colorId: string;
  designId: string;
  sku: string;
  name: string;
}

export interface PlannableRow {
  id?: string;
  size?: { id: string } | null;
  color?: { id: string } | null;
  design?: { id: string } | null;
}

const comboKey = (row: { sizeId: string; colorId: string; designId: string }) =>
  `${row.sizeId}|${row.colorId}|${row.designId}`;

/**
 * Qué pasa con cada fila al generar combinaciones. Una sola regla para el
 * modo automático (aditivo: nada se quita) y la matriz (estricta: las filas
 * nuevas que no están marcadas se descartan). Las filas con id nunca se
 * pierden: si su combinación no está, se conservan aparte y se avisa.
 */
export function planGeneratedVariants<V extends PlannableRow>(
  current: V[],
  generated: GeneratedCombination[],
  mode: "additive" | "strict",
): { kept: V[]; toCreate: GeneratedCombination[]; keptOutside: V[]; dropped: V[] } {
  const seen = new Set<string>();
  const unique = generated.filter((combination) => {
    const key = comboKey(combination);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rowKey = (row: V) =>
    row.size?.id && row.color?.id && row.design?.id
      ? comboKey({ sizeId: row.size.id, colorId: row.color.id, designId: row.design.id })
      : null;
  const matched = new Set<number>();
  const kept: V[] = [];
  const toCreate: GeneratedCombination[] = [];
  for (const combination of unique) {
    const index = current.findIndex(
      (row, position) => !matched.has(position) && rowKey(row) === comboKey(combination),
    );
    if (index === -1) {
      toCreate.push(combination);
    } else {
      matched.add(index);
      kept.push(current[index]);
    }
  }
  const keptOutside: V[] = [];
  const dropped: V[] = [];
  current.forEach((row, position) => {
    if (matched.has(position)) return;
    if (row.id) keptOutside.push(row);
    else if (mode === "additive") kept.push(row);
    else dropped.push(row);
  });
  return { kept, toCreate, keptOutside, dropped };
}
