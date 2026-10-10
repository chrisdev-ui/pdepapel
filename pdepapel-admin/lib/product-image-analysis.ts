import { isValidGtin } from "@/lib/product-identifiers";
import { createHash } from "node:crypto";

import {
  formatProductQuantity,
  getCanonicalHeadNoun,
  isProductTypeChange,
  toNamingKey,
  isLicenceName,
  normalizeBrandName,
  normalizeProductNamePart,
  normalizeSuggestedProductName,
} from "@/lib/product-naming";
import {
  HEAD_NOUN_SYNONYMS,
  MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
  SALES_ADJECTIVES,
} from "@/constants/product-naming";
import { normalizeCatalogOptionKey } from "@/lib/catalog-options";
import {
  createPlainTextRichTextHtml,
  richTextToPlainText,
  sanitizeRichTextHtml,
} from "@/lib/rich-text";
import { z } from "zod";

export { MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES };
export const PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT = 20;
export const PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS = 60 * 60 * 24;
export const PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX = 3;
export const PRODUCT_TYPE_CHANGE_WARNING =
  "La IA sugiere otro tipo de producto: revisa antes de aplicar.";

const CLOUDINARY_IMAGE_HOST = "res.cloudinary.com";

export const EVIDENCE_FIELDS = [
  "name",
  "category",
  "brand",
  "color",
  "design",
  "size",
  "quantity",
  "material",
  "tip",
  "measurements",
  "model",
  "description",
] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];
export type FieldConfidence = "alta" | "media" | "baja";

const fieldEvidenceSchema = z.object({
  confidence: z.enum(["alta", "media", "baja"]),
  photos: z
    .array(z.number().int().min(0))
    .max(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES),
});

export const productImageAnalysisRequestSchema = z.object({
  imageUrls: z
    .array(z.string().url())
    .min(1, "Agrega al menos una imagen antes de analizar.")
    .max(
      MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
      `Puedes analizar hasta ${MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES} imágenes a la vez.`,
    ),
  categoryName: z.string().trim().max(120).optional(),
  /** Nombre que ya tiene el producto: respalda la cantidad del nombre propuesto. */
  currentName: z.string().trim().max(191).optional(),
});

export const productImageAnalysisOutputSchema = z.object({
  suggestedBaseName: z.string().max(120).nullable(),
  suggestedNameOptions: z
    .array(z.string().max(120))
    .max(PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX)
    .default([]),
  suggestedDescription: z.string().max(3000).nullable(),
  brand: z.string().max(120).nullable(),
  categoryName: z.string().max(120).nullable(),
  categoryIsDeterministic: z.boolean(),
  sizeName: z.string().max(80).nullable(),
  sizeIsDeterministic: z.boolean(),
  colorName: z.string().max(80).nullable(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  colorIsDeterministic: z.boolean(),
  designName: z.string().max(80).nullable(),
  designIsDeterministic: z.boolean(),
  gtin: z
    .object({
      value: z.string().max(14),
      evidence: z.string().max(180),
    })
    .nullable(),
  mpn: z
    .object({
      value: z.string().max(70),
      evidence: z.string().max(180),
    })
    .nullable(),
  variantRecommendation: z.object({
    shouldCreateVariants: z.boolean(),
    axes: z.array(z.enum(["COLOR", "DESIGN", "SIZE"])).max(3),
    evidence: z.string().max(180).nullable(),
  }),
  variantCandidates: z
    .array(
      z.object({
        imageIndex: z
          .number()
          .int()
          .min(0)
          .max(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES - 1),
        colorName: z.string().max(80).nullable(),
        colorHex: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullable(),
        colorIsDeterministic: z.boolean(),
        designName: z.string().max(80).nullable(),
        designIsDeterministic: z.boolean(),
        sizeName: z.string().max(80).nullable(),
        sizeIsDeterministic: z.boolean(),
        evidence: z.string().max(180).nullable(),
      }),
    )
    .max(MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES)
    .default([]),
  catalogAttributes: z
    .array(
      z.object({
        optionName: z.string().max(80),
        valueName: z.string().max(100),
        evidence: z.string().max(180),
      }),
    )
    .max(6)
    .default([]),
  observations: z.array(z.string().max(180)).max(4),
  limitations: z.array(z.string().max(180)).max(3),
  quantity: z
    .object({
      value: z.number().int().positive(),
      mixed: z.enum(["colores", "diseños"]).nullable(),
    })
    .nullable()
    .default(null),
  material: z.string().max(80).nullable().default(null),
  tip: z.string().max(80).nullable().default(null),
  measurements: z.string().max(80).nullable().default(null),
  model: z.string().max(80).nullable().default(null),
  keywords: z.array(z.string().max(60)).max(12).default([]),
  fieldEvidence: z
    .object(
      Object.fromEntries(
        EVIDENCE_FIELDS.map((field) => [field, fieldEvidenceSchema.optional()]),
      ) as Record<EvidenceField, z.ZodOptional<typeof fieldEvidenceSchema>>,
    )
    .default({}),
});

export type ProductImageAnalysisOutput = z.infer<
  typeof productImageAnalysisOutputSchema
>;

export type ProductImageVariantCandidate = {
  imageIndex: number;
  colorName: string | null;
  colorHex: string | null;
  colorId: string | null;
  colorSource: "existing" | "new" | "not_detected";
  designName: string | null;
  designId: string | null;
  designSource: "existing" | "new" | "not_detected";
  sizeName: string | null;
  sizeId: string | null;
  evidence: string | null;
};

export type ProductCatalogAttribute = {
  key: string;
  name: string;
  value: string;
  evidence: string;
};

export type ProductTaxonomyAlternative = {
  id: string;
  name: string;
  value?: string;
  typeName?: string;
};

export type ProductImageAnalysis = Omit<
  ProductImageAnalysisOutput,
  | "catalogAttributes"
  | "variantCandidates"
  | "fieldEvidence"
  | "quantity"
  | "material"
  | "tip"
  | "measurements"
  | "model"
> & {
  /** Confianza y números de foto (desde 0) que prueban cada campo. */
  fieldEvidence: Partial<
    Record<EvidenceField, { confidence: FieldConfidence; photos: number[] }>
  >;
  categoryId: string | null;
  categorySource: "existing" | "not_detected";
  sizeId: string | null;
  sizeSource: "existing" | "not_detected";
  colorId: string | null;
  colorSource: "existing" | "new" | "not_detected";
  designId: string | null;
  designSource: "existing" | "new" | "not_detected";
  categoryAlternatives?: ProductTaxonomyAlternative[];
  sizeAlternatives?: ProductTaxonomyAlternative[];
  colorAlternatives?: ProductTaxonomyAlternative[];
  designAlternatives?: ProductTaxonomyAlternative[];
  variantCandidates: ProductImageVariantCandidate[];
  catalogAttributes: ProductCatalogAttribute[];
  /** La IA propone otro tipo de producto que el nombre o la subcategoría actuales. */
  typeWarning: string | null;
};

type TaxonomyOption = {
  id: string;
  name: string;
  value?: string;
};

type CategoryTaxonomyOption = TaxonomyOption & {
  typeName?: string;
};

function normalizeForMatching(value?: string | null) {
  return normalizeProductNamePart(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanOptionalText(value?: string | null, maxLength = 120) {
  const normalized = normalizeProductNamePart(value);
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanSuggestedName(value?: string | null) {
  const normalized = cleanOptionalText(value);
  if (!normalized) return null;

  return (
    normalizeSuggestedProductName(
      normalized.replace(/\bpad\s+mouse\b/gi, "Mouse pad"),
    ) || null
  );
}

function getSuggestedNameOptions(output: ProductImageAnalysisOutput) {
  const seen = new Set<string>();

  return [output.suggestedBaseName, ...output.suggestedNameOptions]
    .map((option) => cleanSuggestedName(option))
    .filter((option): option is string => Boolean(option))
    .filter((option) => {
      const normalizedOption = normalizeForMatching(option);
      if (seen.has(normalizedOption)) return false;

      seen.add(normalizedOption);
      return true;
    })
    .slice(0, PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX);
}

const SALES_ADJECTIVE_PATTERN = new RegExp(
  `(^|<[^>]+>|[.!?]\\s+)(?:${SALES_ADJECTIVES.join("|")})\\s+(\\p{L})`,
  "giu",
);

/** Las frases no abren con adjetivos de venta (plan §2.3). */
function removeSalesAdjectives(html: string) {
  return html.replace(
    SALES_ADJECTIVE_PATTERN,
    (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase("es-CO")}`,
  );
}

function cleanDescription(value?: string | null) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const html = /<\/?[a-z][\s\S]*>/i.test(normalized)
    ? sanitizeRichTextHtml(normalized)
    : createPlainTextRichTextHtml(normalized);
  const plainText = richTextToPlainText(html);

  return plainText && plainText.length <= 1800 && html.length <= 3000
    ? removeSalesAdjectives(html)
    : null;
}

function cleanColorHex(value?: string | null) {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null;
}

export function isSupportedProductImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === CLOUDINARY_IMAGE_HOST;
  } catch {
    return false;
  }
}

export function getProductImageAnalysisDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function getProductImageAnalysisRateLimitKey(
  storeId: string,
  date = new Date(),
) {
  return `store:${storeId}:product-image-analysis:${getProductImageAnalysisDay(date)}`;
}

export function getProductImageAnalysisCacheKey(
  storeId: string,
  input: {
    imageUrls: string[];
    categoryName?: string;
    currentName?: string;
    categories: CategoryTaxonomyOption[];
    sizes: TaxonomyOption[];
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
  },
) {
  const normalizedInput = {
    version: 9,
    // En orden: la evidencia nombra fotos por su número.
    imageUrls: [...input.imageUrls],
    categoryName: normalizeForMatching(input.categoryName),
    currentName: normalizeForMatching(input.currentName),
    categories: [...input.categories]
      .map((category) => ({
        id: category.id,
        name: category.name,
        typeName: category.typeName ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    sizes: [...input.sizes]
      .map((size) => ({
        id: size.id,
        name: size.name,
        value: size.value ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    colors: [...input.colors]
      .map((color) => ({
        id: color.id,
        name: color.name,
        value: color.value ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    designs: [...input.designs]
      .map((design) => ({ id: design.id, name: design.name }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalizedInput))
    .digest("hex");

  return `store:${storeId}:product-image-analysis:cache:${fingerprint}`;
}

function findExactTaxonomyMatch(
  value: string | null,
  options: TaxonomyOption[],
) {
  const normalizedValue = normalizeForMatching(value);
  if (!normalizedValue) return null;

  const matches = options.filter(
    (option) => normalizeForMatching(option.name) === normalizedValue,
  );

  return matches.length === 1 ? matches[0] : null;
}

/**
 * El modelo a veces contesta con el sustantivo del nombre («Cartuchera») en
 * vez de la subcategoría («Cartucheras»): si ese sustantivo es de una sola
 * subcategoría, es esa, antes de proponer una nueva.
 */
function findCategoryMatch(
  value: string | null,
  categories: CategoryTaxonomyOption[],
) {
  const exact = findExactTaxonomyMatch(value, categories);
  if (exact) return exact;
  const key = normalizeForMatching(value);
  if (!key) return null;
  const byNoun = categories.filter((category) => {
    const noun = getCanonicalHeadNoun(category.name);
    return (
      noun !== null &&
      [noun.singular, noun.plural].some(
        (form) => normalizeForMatching(form) === key,
      )
    );
  });
  return byNoun.length === 1 ? byNoun[0] : null;
}

/** Un sinónimo conocido al inicio («Planificador») pasa al sustantivo canónico de la subcategoría, en el mismo número. */
function replaceSynonymNoun(name: string, categoryName: string) {
  const noun = getCanonicalHeadNoun(categoryName);
  if (!noun) return name;
  const key = toNamingKey(categoryName);
  const set = name.match(/^sets? de /i)?.[0] ?? "";
  const words = name.slice(set.length).split(" ");
  for (const synonym of HEAD_NOUN_SYNONYMS.filter(
    (entry) => entry.categoryKey === key,
  )) {
    for (const [form, plural] of [
      [synonym.plural, true],
      [synonym.singular, false],
    ] as const) {
      const size = form.split(" ").length;
      if (toNamingKey(words.slice(0, size).join(" ")) !== toNamingKey(form))
        continue;
      const usePlural =
        Boolean(set) || (plural && synonym.plural !== synonym.singular);
      const canonical = usePlural ? noun.plural : noun.singular;
      const head = set ? canonical.toLocaleLowerCase("es-CO") : canonical;
      return `${set}${[head, ...words.slice(size)].join(" ")}`;
    }
  }
  return name;
}

/** Corrige el sustantivo inicial si difiere en una letra o en tildes del canónico de la subcategoría. */
function fixLeadingNoun(name: string, categoryName: string | null) {
  if (categoryName) name = replaceSynonymNoun(name, categoryName);
  const noun = getCanonicalHeadNoun(categoryName);
  if (!noun || /^set de /i.test(name)) return name;
  const words = name.split(" ");
  for (const form of [noun.singular, noun.plural]) {
    const size = form.split(" ").length;
    const head = words.slice(0, size).join(" ");
    if (head === form) return name;
    const distance = getLevenshteinDistance(
      normalizeForMatching(head),
      normalizeForMatching(form),
    );
    if (distance <= 1 && words.length >= size)
      return [form, ...words.slice(size)].join(" ");
  }
  return name;
}

function getLevenshteinDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function getTaxonomySimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const longestLength = Math.max(left.length, right.length);
  const editSimilarity =
    longestLength === 0
      ? 0
      : 1 - getLevenshteinDistance(left, right) / longestLength;
  const leftTokenList = left.split(" ").filter(Boolean);
  const rightTokenList = right.split(" ").filter(Boolean);
  const rightTokens = new Set(rightTokenList);
  const sharedTokenCount = leftTokenList.filter((token) =>
    rightTokens.has(token),
  ).length;
  const tokenUnionSize = new Set(leftTokenList.concat(rightTokenList)).size;
  const tokenSimilarity = tokenUnionSize
    ? sharedTokenCount / tokenUnionSize
    : 0;
  const containmentSimilarity =
    Math.min(left.length, right.length) >= 4 &&
    (left.includes(right) || right.includes(left))
      ? 0.9
      : 0;

  return Math.max(editSimilarity, tokenSimilarity, containmentSimilarity);
}

function getTaxonomyAlternatives(
  value: string | null,
  options: (TaxonomyOption & { typeName?: string })[],
): ProductTaxonomyAlternative[] {
  const normalizedValue = normalizeForMatching(value);
  if (!normalizedValue) return [];

  const exactMatches = options.filter(
    (option) => normalizeForMatching(option.name) === normalizedValue,
  );
  if (exactMatches.length === 1) return [];
  if (exactMatches.length > 1) return exactMatches.slice(0, 3);

  return options
    .map((option) => ({
      option,
      score: getTaxonomySimilarity(
        normalizedValue,
        normalizeForMatching(option.name),
      ),
    }))
    .filter(({ score }) => score >= 0.72)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.option.name.localeCompare(right.option.name, "es-CO"),
    )
    .slice(0, 3)
    .map(({ option }) => option);
}

function hasExactTaxonomyName(value: string | null, options: TaxonomyOption[]) {
  const normalizedValue = normalizeForMatching(value);
  return Boolean(
    normalizedValue &&
    options.some(
      (option) => normalizeForMatching(option.name) === normalizedValue,
    ),
  );
}

function sanitizeVariantCandidates(
  output: ProductImageAnalysisOutput,
  options: {
    sizes: TaxonomyOption[];
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
  },
): ProductImageVariantCandidate[] {
  const usedImageIndexes = new Set<number>();

  return (output.variantCandidates ?? []).flatMap((candidate) => {
    if (usedImageIndexes.has(candidate.imageIndex)) return [];

    const colorName = candidate.colorIsDeterministic
      ? cleanOptionalText(candidate.colorName, 80)
      : null;
    const designName = candidate.designIsDeterministic
      ? cleanOptionalText(candidate.designName, 80)
      : null;
    const sizeName = candidate.sizeIsDeterministic
      ? cleanOptionalText(candidate.sizeName, 80)
      : null;
    const color = findExactTaxonomyMatch(colorName, options.colors);
    const design = findExactTaxonomyMatch(designName, options.designs);
    const size = findExactTaxonomyMatch(sizeName, options.sizes);
    const colorHex = color?.value ?? cleanColorHex(candidate.colorHex);
    const canCreateColor = Boolean(
      colorName &&
      colorHex &&
      !color &&
      !hasExactTaxonomyName(colorName, options.colors),
    );
    const canCreateDesign = Boolean(
      designName &&
      !design &&
      !hasExactTaxonomyName(designName, options.designs),
    );
    const hasConfirmedAttribute = Boolean(
      color || design || size || canCreateColor || canCreateDesign,
    );

    if (!hasConfirmedAttribute) return [];

    usedImageIndexes.add(candidate.imageIndex);
    return [
      {
        imageIndex: candidate.imageIndex,
        colorName: color?.name ?? colorName,
        colorHex,
        colorId: color?.id ?? null,
        colorSource: color
          ? "existing"
          : canCreateColor
            ? "new"
            : "not_detected",
        designName: design?.name ?? designName,
        designId: design?.id ?? null,
        designSource: design
          ? "existing"
          : canCreateDesign
            ? "new"
            : "not_detected",
        sizeName: size?.name ?? sizeName,
        sizeId: size?.id ?? null,
        evidence: cleanOptionalText(candidate.evidence, 180),
      },
    ];
  });
}

function sanitizeIdentifierSuggestion(
  suggestion: { value: string; evidence: string } | null,
  sanitizeValue: (value: string) => string | null,
) {
  if (!suggestion) return null;

  const value = sanitizeValue(suggestion.value);
  const evidence = cleanOptionalText(suggestion.evidence, 180);

  return value && evidence ? { value, evidence } : null;
}

function cleanGtin(value: string) {
  const normalized = value.trim().replace(/[\s-]/g, "");
  return isValidGtin(normalized) ? normalized : null;
}

function cleanMpn(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return /^[A-Za-z0-9][A-Za-z0-9 ._/-]{1,69}$/.test(normalized)
    ? normalized
    : null;
}

const EXTRA_ATTRIBUTE_NAMES = {
  quantity: "Cantidad",
  material: "Material",
  tip: "Punta",
  measurements: "Medidas",
  model: "Modelo",
} as const;

function describeEvidencePhotos(photos?: number[]) {
  return photos?.length
    ? `Foto${photos.length === 1 ? "" : "s"} ${photos.map((photo) => photo + 1).join(", ")}`
    : "Leído en las fotos";
}

function sanitizeFieldEvidence(
  evidence: ProductImageAnalysisOutput["fieldEvidence"] | undefined,
  photoCount: number,
): ProductImageAnalysis["fieldEvidence"] {
  return Object.fromEntries(
    Object.entries(evidence ?? {}).flatMap(([field, value]) =>
      value
        ? [
            [
              field,
              {
                confidence: value.confidence,
                photos: Array.from(new Set(value.photos)).filter(
                  (photo) => photo >= 0 && photo < photoCount,
                ),
              },
            ],
          ]
        : [],
    ),
  );
}

function getExtraCatalogAttributes(
  output: ProductImageAnalysisOutput,
  fieldEvidence: ProductImageAnalysis["fieldEvidence"],
): ProductCatalogAttribute[] {
  const values: [keyof typeof EXTRA_ATTRIBUTE_NAMES, string | null][] = [
    [
      "quantity",
      output.quantity
        ? formatProductQuantity(output.quantity.value, output.quantity.mixed)
        : null,
    ],
    ["material", cleanOptionalText(output.material ?? null, 80)],
    ["tip", cleanOptionalText(output.tip ?? null, 80)],
    ["measurements", cleanOptionalText(output.measurements ?? null, 80)],
    ["model", cleanOptionalText(output.model ?? null, 80)],
  ];
  return values.flatMap(([field, value]) => {
    if (!value) return [];
    const name = EXTRA_ATTRIBUTE_NAMES[field];
    return [
      {
        key: normalizeCatalogOptionKey(name),
        name,
        value,
        evidence: describeEvidencePhotos(fieldEvidence[field]?.photos),
      },
    ];
  });
}

export function sanitizeProductImageAnalysis(
  output: ProductImageAnalysisOutput,
  options: {
    categories: CategoryTaxonomyOption[];
    sizes: TaxonomyOption[];
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
    /** Fotos enviadas: la evidencia no puede nombrar una que no existe. */
    photoCount?: number;
    /** Lo que el producto ya tiene, para avisar si la IA cambia el tipo. */
    current?: { name?: string | null; categoryName?: string | null };
  },
): ProductImageAnalysis {
  const photoCount = options.photoCount ?? MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES;
  const fieldEvidence = sanitizeFieldEvidence(output.fieldEvidence, photoCount);
  // Una licencia (Sanrio, Stitch…) es un diseño, nunca la marca.
  const rawBrand = cleanOptionalText(output.brand);
  const brandIsLicence = isLicenceName(rawBrand);
  if (brandIsLicence && !output.designName) {
    output = { ...output, designName: rawBrand, designIsDeterministic: true };
  }
  const suggestedNameOptions = getSuggestedNameOptions(output);
  const suggestedCategoryName = output.categoryIsDeterministic
    ? cleanOptionalText(output.categoryName, 120)
    : null;
  const suggestedSizeName = output.sizeIsDeterministic
    ? cleanOptionalText(output.sizeName, 80)
    : null;
  const suggestedColorName = output.colorIsDeterministic
    ? cleanOptionalText(output.colorName, 80)
    : null;
  const suggestedDesignName = output.designIsDeterministic
    ? cleanOptionalText(output.designName, 80)
    : null;
  const category = findCategoryMatch(suggestedCategoryName, options.categories);
  const fixedNameOptions = suggestedNameOptions.map((name) =>
    fixLeadingNoun(name, category?.name ?? suggestedCategoryName),
  );
  const size = findExactTaxonomyMatch(suggestedSizeName, options.sizes);
  const color = findExactTaxonomyMatch(suggestedColorName, options.colors);
  const design = findExactTaxonomyMatch(suggestedDesignName, options.designs);
  const colorHex = cleanColorHex(output.colorHex);
  const shouldCreateVariants =
    output.variantRecommendation.shouldCreateVariants &&
    output.variantRecommendation.axes.length > 0;
  const variantCandidates = shouldCreateVariants
    ? sanitizeVariantCandidates(output, options)
    : [];
  const canReviewVariantCandidates = variantCandidates.length >= 2;

  const typeWarning = isProductTypeChange({
    suggestedName: fixedNameOptions[0],
    suggestedCategoryName: category?.name ?? suggestedCategoryName,
    currentName: options.current?.name,
    currentCategoryName: options.current?.categoryName,
  })
    ? PRODUCT_TYPE_CHANGE_WARNING
    : null;

  return {
    typeWarning,
    suggestedBaseName: fixedNameOptions[0] ?? null,
    suggestedNameOptions: fixedNameOptions,
    suggestedDescription: cleanDescription(output.suggestedDescription),
    brand: brandIsLicence ? null : normalizeBrandName(rawBrand),
    categoryName: category?.name ?? suggestedCategoryName,
    categoryIsDeterministic: Boolean(suggestedCategoryName),
    categoryId: category?.id ?? null,
    categorySource: category ? "existing" : "not_detected",
    categoryAlternatives: getTaxonomyAlternatives(
      suggestedCategoryName,
      options.categories,
    ),
    sizeName: size?.name ?? suggestedSizeName,
    sizeIsDeterministic: Boolean(suggestedSizeName),
    sizeId: size?.id ?? null,
    sizeSource: size ? "existing" : "not_detected",
    sizeAlternatives: getTaxonomyAlternatives(suggestedSizeName, options.sizes),
    colorName: color?.name ?? suggestedColorName,
    colorHex: color?.value ?? colorHex,
    colorIsDeterministic: Boolean(suggestedColorName),
    colorId: color?.id ?? null,
    colorSource: color
      ? "existing"
      : suggestedColorName &&
          colorHex &&
          !hasExactTaxonomyName(suggestedColorName, options.colors)
        ? "new"
        : "not_detected",
    colorAlternatives: getTaxonomyAlternatives(
      suggestedColorName,
      options.colors,
    ),
    designName: design?.name ?? suggestedDesignName,
    designIsDeterministic: Boolean(suggestedDesignName),
    designId: design?.id ?? null,
    designSource: design
      ? "existing"
      : suggestedDesignName &&
          !hasExactTaxonomyName(suggestedDesignName, options.designs)
        ? "new"
        : "not_detected",
    designAlternatives: getTaxonomyAlternatives(
      suggestedDesignName,
      options.designs,
    ),
    gtin: sanitizeIdentifierSuggestion(output.gtin, cleanGtin),
    mpn: sanitizeIdentifierSuggestion(output.mpn, cleanMpn),
    variantRecommendation: {
      shouldCreateVariants: canReviewVariantCandidates,
      axes: canReviewVariantCandidates ? output.variantRecommendation.axes : [],
      evidence: canReviewVariantCandidates
        ? cleanOptionalText(output.variantRecommendation.evidence, 180)
        : null,
    },
    variantCandidates,
    catalogAttributes: (() => {
      const extras = getExtraCatalogAttributes(output, fieldEvidence);
      const extraKeys = new Set(extras.map((attribute) => attribute.key));
      const fromModel = output.catalogAttributes.flatMap((attribute) => {
        const name = cleanOptionalText(attribute.optionName, 80);
        const value = cleanOptionalText(attribute.valueName, 100);
        const evidence = cleanOptionalText(attribute.evidence, 180);
        const key = name ? normalizeCatalogOptionKey(name) : "";

        return key && name && value && evidence && !extraKeys.has(key)
          ? [{ key, name, value, evidence }]
          : [];
      });
      return [...extras, ...fromModel];
    })(),
    fieldEvidence,
    keywords: Array.from(
      new Set(
        (output.keywords ?? [])
          .map((keyword) =>
            cleanOptionalText(keyword, 60)?.toLocaleLowerCase("es-CO"),
          )
          .filter((keyword): keyword is string => Boolean(keyword)),
      ),
    ).slice(0, 8),
    observations: output.observations
      .map((observation) => cleanOptionalText(observation, 180))
      .filter((observation): observation is string => Boolean(observation)),
    limitations: output.limitations
      .map((limitation) => cleanOptionalText(limitation, 180))
      .filter((limitation): limitation is string => Boolean(limitation)),
  };
}
