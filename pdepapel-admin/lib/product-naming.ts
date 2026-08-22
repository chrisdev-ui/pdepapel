export const PRODUCT_NAME_RECOMMENDED_MAX_LENGTH = 65;
export const PRODUCT_NAME_MAX_LENGTH = 120;

export type ProductNamingInput = {
  baseName?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  designName?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  sizeValue?: string | null;
  includeVariantAttributes?: boolean;
};

export type ProductNameSuggestion = {
  name: string;
  length: number;
  warnings: string[];
};

const EMPTY_VALUES = new Set([
  "",
  "-",
  "n/a",
  "na",
  "ninguno",
  "none",
  "sin diseño",
  "sin color",
  "sin tamaño",
  "general",
]);

const CATEGORY_HEAD_NOUNS: Record<string, string> = {
  agendas: "Agenda",
  argollados: "Cuaderno argollado",
  boligrafos: "Lapicero",
  "boligrafos lapiceros": "Lapicero",
  borradores: "Borrador",
  cuadernos: "Cuaderno",
  "cuadernos libretas": "Cuaderno",
  "notas adhesivas": "Notas adhesivas",
  lapices: "Lápiz",
  lapiceros: "Lapicero",
  llaveros: "Llavero",
  marcadores: "Marcador",
  papeles: "Papel",
  resaltadores: "Resaltador",
  sacapuntas: "Tajalápiz",
  stickers: "Stickers",
};

const LOGISTICS_SIZE_VALUE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)-(?:L|P)$/i;
const INTERNAL_SIZE_CODE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)\+$/i;
const LOGISTICS_SIZE_NAME_PATTERN =
  /^(?:muy\s+)?(?:pequeño|mediano|grande)\s+(?:liviano|pesado)$/i;
const COMMERCIAL_MEASUREMENT_PATTERN =
  /(?:\b[A-C][0-9]\b|\b\d+(?:[.,]\d+)?\s?(?:mm|cm|m|g|kg|ml|l|oz)\b|\b(?:carta|oficio|legal)\b)/i;
const SIZE_RELEVANT_CATEGORY_PATTERN =
  /(?:ropa|camiseta|buzo|hoodie|disfraz|media|calcet|calzado|zapato|sandalia)/i;

function normalizeForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeProductNamePart(value?: string | null) {
  if (!value) return "";

  const normalized = value.replace(/[_|]+/g, " ").replace(/\s+/g, " ").trim();

  return EMPTY_VALUES.has(normalizeForComparison(normalized)) ? "" : normalized;
}

/**
 * `Size` doubles as the inventory/shipping profile in this catalog. Values
 * such as M-P and legacy labels such as M+ are operational codes, not facts a
 * customer can use to decide on a product. Keep genuine commercial measures
 * (A5, 57 mm, Carta) while only allowing letter sizes for categories where a
 * customer actually chooses a size.
 */
export function getCustomerFacingSizeName(input: {
  categoryName?: string | null;
  sizeName?: string | null;
  sizeValue?: string | null;
}) {
  const sizeName = normalizeProductNamePart(input.sizeName);
  const sizeValue = normalizeProductNamePart(input.sizeValue);

  if (!sizeName) return "";

  if (
    LOGISTICS_SIZE_VALUE_PATTERN.test(sizeName) ||
    LOGISTICS_SIZE_NAME_PATTERN.test(sizeName) ||
    INTERNAL_SIZE_CODE_PATTERN.test(sizeName)
  ) {
    return "";
  }

  if (COMMERCIAL_MEASUREMENT_PATTERN.test(sizeName)) {
    return sizeName;
  }

  if (SIZE_RELEVANT_CATEGORY_PATTERN.test(input.categoryName || "")) {
    return sizeName;
  }

  if (LOGISTICS_SIZE_VALUE_PATTERN.test(sizeValue)) {
    return "";
  }

  return "";
}

function hasEquivalentContent(parts: string[], candidate: string) {
  const normalizedCandidate = normalizeForComparison(candidate);
  if (!normalizedCandidate) return true;

  return parts.some((part) => {
    const normalizedPart = normalizeForComparison(part);
    if (normalizedCandidate.length <= 2) {
      return (
        normalizedPart === normalizedCandidate ||
        normalizedPart.split(" ").includes(normalizedCandidate)
      );
    }

    return (
      normalizedPart === normalizedCandidate ||
      normalizedPart.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedPart)
    );
  });
}

export function getCategoryHeadNoun(categoryName?: string | null) {
  const category = normalizeProductNamePart(categoryName);
  if (!category) return "";

  const normalizedCategory = normalizeForComparison(category);
  if (CATEGORY_HEAD_NOUNS[normalizedCategory]) {
    return CATEGORY_HEAD_NOUNS[normalizedCategory];
  }

  const firstCategory = category.split("/")[0]?.trim() || category;
  return firstCategory;
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toLocaleUpperCase("es-CO")}${value.slice(1)}`;
}

export function buildProductNameSuggestion(
  input: ProductNamingInput,
): ProductNameSuggestion {
  const baseName = normalizeProductNamePart(input.baseName);
  const categoryHeadNoun = getCategoryHeadNoun(input.categoryName);
  const parts: string[] = [];

  if (baseName) {
    parts.push(baseName);
  } else if (categoryHeadNoun) {
    parts.push(categoryHeadNoun);
  }

  const attributes = [
    normalizeProductNamePart(input.brand),
    normalizeProductNamePart(input.designName),
    input.includeVariantAttributes
      ? normalizeProductNamePart(input.colorName)
      : "",
    input.includeVariantAttributes
      ? getCustomerFacingSizeName({
          categoryName: input.categoryName,
          sizeName: input.sizeName,
          sizeValue: input.sizeValue,
        })
      : "",
  ];

  for (const attribute of attributes) {
    if (attribute && !hasEquivalentContent(parts, attribute)) {
      parts.push(attribute);
    }
  }

  const name = capitalizeFirst(parts.join(" ").replace(/\s+/g, " ").trim());
  const warnings: string[] = [];

  if (!baseName) {
    warnings.push(
      "Agrega el nombre o detalle que aparece en el empaque antes de guardar.",
    );
  }
  if (name.length > PRODUCT_NAME_RECOMMENDED_MAX_LENGTH) {
    warnings.push(
      `El nombre tiene ${name.length} caracteres. Procura dejarlo en ${PRODUCT_NAME_RECOMMENDED_MAX_LENGTH} o menos para tarjetas y resultados de búsqueda.`,
    );
  }
  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    warnings.push(
      `El nombre supera el máximo permitido de ${PRODUCT_NAME_MAX_LENGTH} caracteres.`,
    );
  }

  return { name, length: name.length, warnings };
}

export function buildProductVariantNameSuggestion(
  input: ProductNamingInput,
): ProductNameSuggestion {
  return buildProductNameSuggestion({
    ...input,
    includeVariantAttributes: true,
  });
}
