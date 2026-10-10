import {
  BRAND_SPELLINGS,
  CANONICAL_HEAD_NOUNS,
  HEAD_NOUN_SYNONYMS,
  LICENCE_NAMES,
  SALES_ADJECTIVES,
  type CanonicalHeadNoun,
} from "@/constants/product-naming";

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
  includeColorInName?: boolean;
  includeDesignInName?: boolean;
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

/**
 * Color and design are mandatory operational attributes in this catalog, but
 * they are only customer-facing when the final title actually confirms them.
 * This keeps feeds from advertising a generic fallback such as "Clásico" or
 * "Pastel" as if it described every product that happens to use that record.
 */
export function getCustomerFacingAttributeName(input: {
  productName?: string | null;
  attributeName?: string | null;
}) {
  const productName = normalizeProductNamePart(input.productName);
  const attributeName = normalizeProductNamePart(input.attributeName);

  if (!productName || !attributeName) return "";

  return hasEquivalentContent([productName], attributeName)
    ? attributeName
    : "";
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
    input.includeDesignInName ? normalizeProductNamePart(input.designName) : "",
    input.includeVariantAttributes && input.includeColorInName
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

/** Tope operativo: Mercado Libre rechaza títulos de más de 60 (plan §2.4). */
export const PRODUCT_NAME_HARD_MAX_LENGTH = 60;

const TRAILING_CONNECTORS = new Set([
  "de",
  "del",
  "con",
  "y",
  "e",
  "para",
  "en",
  "a",
  "la",
  "el",
  "los",
  "las",
  "por",
  "sin",
  "o",
]);

/** Rótulos que sin su valor no dicen nada: si el recorte los deja al final, se van. */
const TRAILING_LABELS = new Set([
  "diseno",
  "punta",
  "color",
  "tamano",
  "modelo",
]);

export function toNamingKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Recorta por palabra completa hasta `max`, sin dejar un conector colgando al final. */
const TRAILING_QUANTITY = /\s(\d+\s(?:colores|diseños)|x\d+)$/i;

/** Recorta por palabra; la cantidad del final se conserva y no queda un número suelto. */
export function fitProductName(
  name: string,
  max = PRODUCT_NAME_HARD_MAX_LENGTH,
) {
  const clean = name.replace(/\s+/g, " ").trim();
  const quantity = clean.length > max ? clean.match(TRAILING_QUANTITY) : null;
  const suffix = quantity?.[1] ?? "";
  const head = quantity ? clean.slice(0, quantity.index) : clean;
  const budget = suffix ? max - suffix.length - 1 : max;
  const kept: string[] = [];
  for (const word of head.split(" ")) {
    if ([...kept, word].join(" ").length > budget) break;
    kept.push(word);
  }
  const cut = kept.join(" ") !== head;
  while (
    kept.length > 1 &&
    (TRAILING_CONNECTORS.has(toNamingKey(kept[kept.length - 1])) ||
      (cut && TRAILING_LABELS.has(toNamingKey(kept[kept.length - 1]))) ||
      (cut && /^\d+(?:[.,]\d+)?$/.test(kept[kept.length - 1])))
  )
    kept.pop();
  return [...kept, suffix].filter(Boolean).join(" ");
}

/** «12 colores» o «6 diseños» si el empaque mezcla; «x10» si las unidades son iguales. */
export function formatProductQuantity(
  quantity: number | null | undefined,
  mixed: "colores" | "diseños" | null,
) {
  if (!quantity || !Number.isInteger(quantity) || quantity < 2) return null;
  return mixed ? `${quantity} ${mixed}` : `x${quantity}`;
}

const LICENCE_KEYS = new Map(
  LICENCE_NAMES.map((licence) => [toNamingKey(licence), licence]),
);

export function isLicenceName(value: string | null | undefined) {
  return Boolean(value && LICENCE_KEYS.has(toNamingKey(value)));
}

/** Marca de fabricante en Title Case («GIPAO» → «Gipao»), con las grafías especiales conocidas. */
export function normalizeBrandName(value: string | null | undefined) {
  const brand = normalizeProductNamePart(value);
  if (!brand) return null;
  const special = BRAND_SPELLINGS[toNamingKey(brand)];
  if (special) return special;
  return brand
    .toLocaleLowerCase("es-CO")
    .replace(
      new RegExp(String.raw`(^|[\s-])(\p{L})`, "gu"),
      (_match, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase("es-CO")}`,
    );
}

export function getCanonicalHeadNoun(
  categoryName: string | null | undefined,
): CanonicalHeadNoun | null {
  if (!categoryName) return null;
  return CANONICAL_HEAD_NOUNS[toNamingKey(categoryName)] ?? null;
}

const HEAD_NOUN_FORMS = [
  ...Object.entries(CANONICAL_HEAD_NOUNS).flatMap(([key, noun]) => [
    { form: toNamingKey(noun.singular), key },
    { form: toNamingKey(noun.plural), key },
  ]),
  ...HEAD_NOUN_SYNONYMS.flatMap((synonym) => [
    { form: toNamingKey(synonym.singular), key: synonym.categoryKey },
    { form: toNamingKey(synonym.plural), key: synonym.categoryKey },
  ]),
].sort((a, b) => b.form.split(" ").length - a.form.split(" ").length);

/** Subcategoría cuyo sustantivo (o un sinónimo) abre el nombre. */
export function getHeadNounCategoryKey(name: string | null | undefined) {
  const words = toNamingKey(name ?? "")
    .replace(/^sets? de /, "")
    .split(" ");
  return (
    HEAD_NOUN_FORMS.find(
      ({ form }) => words.slice(0, form.split(" ").length).join(" ") === form,
    )?.key ?? null
  );
}

function getHeadNounFamily(categoryKey: string) {
  const singular = CANONICAL_HEAD_NOUNS[categoryKey]?.singular ?? categoryKey;
  return toNamingKey(singular)
    .replace(/^set de /, "")
    .split(" ")[0];
}

/**
 * El nombre sugerido abre con un tipo de producto distinto al del nombre
 * actual y al de su subcategoría (Impresora → Lámpara), o con uno que no se
 * reconoce y sin una subcategoría reconocible que lo respalde (Washi → Tizas).
 * Sinónimos y nombres de la misma familia («Cuaderno argollado» / «Cuaderno
 * multimateria») no cuentan; sin nombre ni subcategoría actuales no hay
 * contra qué comparar.
 */
export function isProductTypeChange(input: {
  suggestedName: string | null | undefined;
  suggestedCategoryName?: string | null;
  currentName?: string | null;
  currentCategoryName?: string | null;
}) {
  const current = [
    getHeadNounCategoryKey(input.currentName),
    input.currentCategoryName && getCanonicalHeadNoun(input.currentCategoryName)
      ? toNamingKey(input.currentCategoryName)
      : null,
  ].filter((key): key is string => Boolean(key));
  if (!current.length || !input.suggestedName?.trim()) return false;
  const suggested =
    getHeadNounCategoryKey(input.suggestedName) ??
    (input.suggestedCategoryName &&
    getCanonicalHeadNoun(input.suggestedCategoryName)
      ? toNamingKey(input.suggestedCategoryName)
      : null);
  // Ni el sustantivo ni la subcategoría propuestos se reconocen: no hay cómo saber que es el mismo producto.
  if (!suggested) return true;
  const family = getHeadNounFamily(suggested);
  return !current.some(
    (key) => key === suggested || getHeadNounFamily(key) === family,
  );
}

const SALES_ADJECTIVE_KEYS = new Set(
  SALES_ADJECTIVES.map((adjective) => toNamingKey(adjective)),
);

/**
 * Nombre propuesto dentro de la gramática: sin barras (queda la primera
 * opción), sin adjetivos de venta, marca en mayúscula sostenida pasada a
 * Title Case (las licencias conservan su grafía oficial; siglas de hasta 3
 * letras se respetan) y recortado a 60 por palabra.
 */
export function normalizeSuggestedProductName(
  value: string | null | undefined,
) {
  let name = normalizeProductNamePart(value);
  if (!name) return "";
  name = name.replace(
    new RegExp(
      String.raw`(\p{L}[\p{L}\s]*?)\s*\/\s*[\p{L}\s]+?(?=\s(?:\p{Lu}|de|con|diseño|x\d|\d)|$)`,
      "u",
    ),
    "$1",
  );
  const words = name
    .split(" ")
    .filter((word) => !SALES_ADJECTIVE_KEYS.has(toNamingKey(word)));
  name = words
    .map((word) => {
      const letters = word.replace(new RegExp(String.raw`[^\p{L}]`, "gu"), "");
      if (letters.length < 4 || letters !== letters.toLocaleUpperCase("es-CO"))
        return word;
      const licence = LICENCE_KEYS.get(toNamingKey(word));
      return licence ?? normalizeBrandName(word) ?? word;
    })
    .join(" ");
  for (const licence of LICENCE_NAMES) {
    name = name.replace(
      new RegExp(
        String.raw`(?<!\p{L})${licence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\p{L})`,
        "giu",
      ),
      licence,
    );
  }
  return fitProductName(capitalizeFirst(name.replace(/\s+/g, " ").trim()));
}
