import {
  getCustomerFacingAttributeName,
  getCustomerFacingSizeName,
} from "@/lib/product-naming";

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

export function getGoogleMerchantColor(
  productName: string | null | undefined,
  color: { name?: string | null } | null | undefined,
) {
  return getCustomerFacingAttributeName({
    productName,
    attributeName: color?.name,
  });
}

export function getGoogleMerchantPattern(
  productName: string | null | undefined,
  design: { name?: string | null } | null | undefined,
) {
  return getCustomerFacingAttributeName({
    productName,
    attributeName: design?.name,
  });
}
