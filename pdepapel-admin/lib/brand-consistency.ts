export interface GroupBrandRow {
  id: string;
  brandId: string | null;
  products: { id: string; brandId: string | null }[];
}

export interface GroupBrandMismatch {
  productGroupId: string;
  groupBrandId: string | null;
  productIds: string[];
}

/** Variantes cuya marca no es la de su grupo. En un grupo la marca se elige una vez y todas la llevan. */
export function findGroupBrandMismatches(groups: GroupBrandRow[]): GroupBrandMismatch[] {
  const mismatches: GroupBrandMismatch[] = [];
  for (const group of groups) {
    const productIds = group.products
      .filter((product) => (product.brandId ?? null) !== (group.brandId ?? null))
      .map((product) => product.id);
    if (productIds.length > 0) {
      mismatches.push({ productGroupId: group.id, groupBrandId: group.brandId ?? null, productIds });
    }
  }
  return mismatches;
}

/** La marca que lleva un producto al guardarse: la de su grupo si tiene grupo, la propia si no. */
export function resolveProductBrandId(input: {
  requestedBrandId: string | null | undefined;
  productGroupId: string | null | undefined;
  groupBrandId: string | null | undefined;
}) {
  if (input.productGroupId) return input.groupBrandId ?? null;
  return input.requestedBrandId ?? null;
}
