export function resolveProductGroupVariantStock({
  isExistingVariant,
  submittedStock,
}: {
  isExistingVariant: boolean;
  submittedStock: number;
}) {
  if (isExistingVariant) {
    return {
      initialMovementQuantity: null,
      productStock: undefined,
    };
  }

  return {
    initialMovementQuantity: submittedStock,
    productStock: 0,
  };
}
