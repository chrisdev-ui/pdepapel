import { getCustomerFacingSizeName } from "@/lib/product-naming";

export function getGoogleMerchantSize(
  categoryName: string | null | undefined,
  size: { name?: string | null; value?: string | null } | null | undefined,
) {
  return getCustomerFacingSizeName({
    categoryName,
    sizeName: size?.name,
    sizeValue: size?.value,
  });
}
