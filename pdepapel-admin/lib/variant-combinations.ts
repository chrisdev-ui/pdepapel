type VariantPayload = {
  size?: { id?: string };
  sizeId?: string;
  color?: { id?: string };
  colorId?: string;
  design?: { id?: string };
  designId?: string;
};

/** El mismo texto en el formulario y en el servidor. */
export const DUPLICATE_VARIANT_MESSAGE = "Esta combinación (Color + Tamaño + Diseño) ya existe en este grupo.";

export function hasDuplicateVariantCombination(variants: VariantPayload[]) {
  const combinations = new Set<string>();

  for (const variant of variants) {
    const sizeId = variant.size?.id || variant.sizeId;
    const colorId = variant.color?.id || variant.colorId;
    const designId = variant.design?.id || variant.designId;

    if (!sizeId || !colorId || !designId) continue;

    const combination = `${sizeId}|${colorId}|${designId}`;
    if (combinations.has(combination)) return true;

    combinations.add(combination);
  }

  return false;
}

/** Lo justo de cada variante de un grupo para avisar de una combinación repetida en la ficha. */
export const GROUP_VARIANT_COMBINATION_SELECT = {
  id: true,
  categoryId: true,
  sizeId: true,
  colorId: true,
  designId: true,
} as const;

export type GroupVariantCombination = {
  id: string;
  categoryId: string;
  sizeId: string;
  colorId: string;
  designId: string;
};

/** La otra variante del grupo con esa combinación, si existe (la misma regla que el servidor). */
export function findCombinationOwner(
  variants: readonly GroupVariantCombination[],
  target: { sizeId: string; colorId: string; designId: string; excludeId?: string },
) {
  return (
    variants.find(
      (variant) =>
        variant.id !== target.excludeId &&
        variant.sizeId === target.sizeId &&
        variant.colorId === target.colorId &&
        variant.designId === target.designId,
    ) ?? null
  );
}
