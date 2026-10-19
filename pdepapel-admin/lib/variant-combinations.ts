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
