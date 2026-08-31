import { Product, Size } from "@/types";

const INTERNAL_SHIPPING_SIZE_PATTERN =
  /^(?:XS|S|S\+|M|M\+|L|L\+|XL)(?:-(?:L|P))?$/i;

export function isCustomerFacingSizeValue(value?: string | null) {
  return Boolean(value && !INTERNAL_SHIPPING_SIZE_PATTERN.test(value.trim()));
}

export function isCustomerFacingLegacySize(size?: Size | null) {
  if (!size) return false;

  return isCustomerFacingSizeValue(size.value);
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

export function getCustomerFacingProductOptions(product: Product) {
  const explicitOptions = [...(product.catalogOptionValues ?? [])]
    .sort((left, right) => left.option.displayOrder - right.option.displayOrder)
    .map(({ option, optionValue }) => ({
      name: option.name,
      value: optionValue.name,
    }));

  if (explicitOptions.length > 0) return explicitOptions;

  return isCustomerFacingLegacySize(product.size)
    ? [{ name: "Tamaño", value: product.size.name }]
    : [];
}
