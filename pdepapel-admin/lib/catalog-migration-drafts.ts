/**
 * Opciones del catálogo: después de una acción se vuelven a leer las
 * propuestas, pero lo editado sin guardar en las demás se conserva. Solo se
 * descartan los borradores de las propuestas que la acción tocó (`except`),
 * de las aplicadas y de las que ya no están.
 */
export function keepUnsavedDrafts<A>(
  suggestions: readonly { id: string; status: string; payload: { attributes: A[] } }[],
  drafts: Record<string, A[]>,
  dirty: Record<string, boolean>,
  except: readonly string[] = [],
): { drafts: Record<string, A[]>; dirty: Record<string, boolean> } {
  const touched = new Set(except);
  const keep = new Set(
    suggestions
      .filter((suggestion) => suggestion.status !== "APPLIED" && dirty[suggestion.id] && !touched.has(suggestion.id) && drafts[suggestion.id])
      .map((suggestion) => suggestion.id),
  );
  return {
    drafts: Object.fromEntries(suggestions.map((suggestion) => [suggestion.id, keep.has(suggestion.id) ? drafts[suggestion.id] : suggestion.payload.attributes])),
    dirty: Object.fromEntries(Array.from(keep, (id) => [id, true])),
  };
}
