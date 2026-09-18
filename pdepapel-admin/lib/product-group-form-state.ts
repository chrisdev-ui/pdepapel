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
