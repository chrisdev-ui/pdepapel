/**
 * Traer productos a un grupo: qué filas entran y cuáles se omiten. La misma
 * regla vale para «Traer existentes» y para el escaneo, así una variante no
 * se repite por id ni por combinación de atributos.
 */

export interface VariantLike {
  id?: string | null;
  size?: { id?: string | null } | null;
  color?: { id?: string | null } | null;
  design?: { id?: string | null } | null;
}

/** Clave de la combinación tamaño|color|diseño, vacíos incluidos. */
export function variantAttributeKey(variant: VariantLike) {
  return `${variant.size?.id || "nosize"}|${variant.color?.id || "nocolor"}|${variant.design?.id || "nodesign"}`;
}

export function mergeAdoptedVariants<T extends VariantLike>(current: VariantLike[], incoming: T[]): { toAdd: T[]; skipped: T[] } {
  const currentIds = new Set(current.map((variant) => variant.id).filter(Boolean));
  const currentKeys = new Set(current.map(variantAttributeKey));
  const batchKeys = new Set<string>();
  const toAdd: T[] = [];
  const skipped: T[] = [];
  incoming.forEach((variant) => {
    const key = variantAttributeKey(variant);
    // Ya está (mismo id), repite una combinación existente o se repite en este mismo lote.
    if ((variant.id && currentIds.has(variant.id)) || currentKeys.has(key) || batchKeys.has(key)) {
      skipped.push(variant);
      return;
    }
    batchKeys.add(key);
    toAdd.push(variant);
  });
  return { toAdd, skipped };
}
