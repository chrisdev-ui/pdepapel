import { Product, Size } from "@/types";

const INTERNAL_SHIPPING_SIZE_PATTERN =
  /^(?:XS|S|S\+|M|M\+|L|L\+|XL)(?:-(?:L|P))?$/i;

export function isCustomerFacingLegacySize(size?: Size | null) {
  if (!size) return false;

  return !INTERNAL_SHIPPING_SIZE_PATTERN.test(size.value.trim());
}

export function getStructuredProductSize(product: Product) {
  const explicitSize = product.catalogOptionValues?.find(({ option }) =>
    ["tamano", "tamaño", "formato", "medida"].includes(
      option.key.toLocaleLowerCase("es-CO"),
    ),
  );

  if (explicitSize) return explicitSize.optionValue.name;
  return isCustomerFacingLegacySize(product.size) ? product.size.name : null;
}
