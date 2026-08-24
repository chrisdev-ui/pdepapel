import { createHash } from "node:crypto";

import { normalizeProductNamePart } from "@/lib/product-naming";
import { z } from "zod";

export const MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES = 3;
export const PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT = 20;
export const PRODUCT_IMAGE_ANALYSIS_CACHE_TTL_SECONDS = 60 * 60 * 24;
export const PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX = 3;

const CLOUDINARY_IMAGE_HOST = "res.cloudinary.com";

export const productImageAnalysisRequestSchema = z.object({
  imageUrls: z
    .array(z.string().url())
    .min(1, "Agrega al menos una imagen antes de analizar.")
    .max(
      MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES,
      `Puedes analizar hasta ${MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES} imágenes a la vez.`,
    ),
  categoryName: z.string().trim().max(120).optional(),
});

export const productImageAnalysisOutputSchema = z.object({
  suggestedBaseName: z.string().max(120).nullable(),
  suggestedNameOptions: z
    .array(z.string().max(120))
    .max(PRODUCT_IMAGE_ANALYSIS_NAME_OPTIONS_MAX)
    .default([]),
  suggestedDescription: z.string().max(600).nullable(),
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
  observations: z.array(z.string().max(180)).max(4),
  limitations: z.array(z.string().max(180)).max(3),
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

export type ProductImageAnalysis = Omit<
  ProductImageAnalysisOutput,
  "variantCandidates"
> & {
  categoryId: string | null;
  categorySource: "existing" | "not_detected";
  sizeId: string | null;
  sizeSource: "existing" | "not_detected";
  colorId: string | null;
  colorSource: "existing" | "new" | "not_detected";
  designId: string | null;
  designSource: "existing" | "new" | "not_detected";
  variantCandidates: ProductImageVariantCandidate[];
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

  return normalized.replace(/\bpad\s+mouse\b/gi, "Mouse pad");
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

function cleanDescription(value?: string | null) {
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return normalized && normalized.length <= 600 ? normalized : null;
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
    categories: CategoryTaxonomyOption[];
    sizes: TaxonomyOption[];
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
  },
) {
  const normalizedInput = {
    version: 4,
    imageUrls: [...input.imageUrls].sort(),
    categoryName: normalizeForMatching(input.categoryName),
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
    const canCreateColor = Boolean(colorName && colorHex && !color);
    const canCreateDesign = Boolean(designName && !design);
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

function isValidGtin(value: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(value)) return false;

  const digits = value.split("").map(Number);
  const checkDigit = digits[digits.length - 1];
  const sum = digits
    .slice(0, -1)
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );

  return (10 - (sum % 10)) % 10 === checkDigit;
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

export function sanitizeProductImageAnalysis(
  output: ProductImageAnalysisOutput,
  options: {
    categories: CategoryTaxonomyOption[];
    sizes: TaxonomyOption[];
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
  },
): ProductImageAnalysis {
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
  const category = findExactTaxonomyMatch(
    suggestedCategoryName,
    options.categories,
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

  return {
    suggestedBaseName: suggestedNameOptions[0] ?? null,
    suggestedNameOptions,
    suggestedDescription: cleanDescription(output.suggestedDescription),
    brand: cleanOptionalText(output.brand),
    categoryName: category?.name ?? suggestedCategoryName,
    categoryIsDeterministic: Boolean(suggestedCategoryName),
    categoryId: category?.id ?? null,
    categorySource: category ? "existing" : "not_detected",
    sizeName: size?.name ?? suggestedSizeName,
    sizeIsDeterministic: Boolean(suggestedSizeName),
    sizeId: size?.id ?? null,
    sizeSource: size ? "existing" : "not_detected",
    colorName: color?.name ?? suggestedColorName,
    colorHex: color?.value ?? colorHex,
    colorIsDeterministic: Boolean(suggestedColorName),
    colorId: color?.id ?? null,
    colorSource: color
      ? "existing"
      : suggestedColorName && colorHex
        ? "new"
        : "not_detected",
    designName: design?.name ?? suggestedDesignName,
    designIsDeterministic: Boolean(suggestedDesignName),
    designId: design?.id ?? null,
    designSource: design
      ? "existing"
      : suggestedDesignName
        ? "new"
        : "not_detected",
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
    observations: output.observations
      .map((observation) => cleanOptionalText(observation, 180))
      .filter((observation): observation is string => Boolean(observation)),
    limitations: output.limitations
      .map((limitation) => cleanOptionalText(limitation, 180))
      .filter((limitation): limitation is string => Boolean(limitation)),
  };
}

export function buildProductImageAnalysisPrompt(input: {
  categoryName?: string;
  categories: string[];
  sizes: string[];
  colors: string[];
  designs: string[];
}) {
  const categories = input.categories.join(", ") || "Sin opciones configuradas";
  const sizes = input.sizes.join(", ") || "Sin opciones configuradas";
  const colors = input.colors.join(", ") || "Sin opciones configuradas";
  const designs = input.designs.join(", ") || "Sin opciones configuradas";

  return `Analiza las fotos públicas de un producto de papelería para ayudar a una administradora a completar su catálogo en español de Colombia.

Categoría elegida por la administradora: ${input.categoryName || "Sin categoría"}.
Categorías disponibles en el catálogo: ${categories}.
Tamaños disponibles en el catálogo: ${sizes}.
Colores disponibles en el catálogo: ${colors}.
Diseños disponibles en el catálogo: ${designs}.

Reglas obligatorias:
- Describe únicamente elementos, texto y marca que puedas confirmar visualmente. Nunca adivines marca, cantidad, medida, licencia, material o compatibilidad.
- suggestedBaseName debe ser el primer elemento de suggestedNameOptions: el nombre base recomendado. suggestedNameOptions debe contener de una a tres opciones distintas, breves (máximo 65 caracteres), profesionales y útiles para búsqueda en una tienda colombiana.
- Prioriza el término comercial natural que buscaría una clienta en Colombia, con el tipo de producto al inicio y los detalles visibles después. Usa préstamos establecidos en su orden natural, por ejemplo "mouse pad" y nunca "pad mouse". No hagas traducciones palabra por palabra ni listes palabras clave separadas por barras.
- Las opciones pueden variar solo en redacción; todas deben describir exactamente el mismo producto visible. Incluye descriptores generales que sí se vean y apliquen a todas las unidades, como "de personajes" o "diseños surtidos", pero no una marca, color, diseño particular, medida ni código cuando no sea determinístico para la unidad.
- No incluyas marca, color, diseño de variante ni códigos internos en suggestedBaseName o suggestedNameOptions; deja esos datos en sus campos separados cuando correspondan.
- suggestedDescription puede contener de una a tres frases breves, sin HTML, únicamente con detalles visibles y confirmables. Si las fotos no bastan para una descripción útil, usa null.
- brand debe ser null si no se lee claramente en empaque o producto.
- categoryName solo puede ser una categoría de la lista disponible: devuelve únicamente el nombre antes de los paréntesis, no el tipo. categoryIsDeterministic debe ser true únicamente cuando el producto encaja de forma clara. Nunca propongas ni inventes una categoría o tipo nuevo.
- sizeName solo puede ser un tamaño de la lista disponible y sizeIsDeterministic debe ser true únicamente cuando la medida o formato se lee claramente. Nunca uses códigos internos ni inventes tamaños.
- colorName puede coincidir exactamente con un color disponible o proponer un nuevo nombre corto en español. Úsalo solo cuando la foto representa de forma determinística una variante de un único color. Si propones un color nuevo, colorHex debe ser su tono dominante en formato #RRGGBB. Si es multicolor, pastel, una foto de familia o no estás segura, usa null, colorHex null y colorIsDeterministic false.
- designName puede coincidir exactamente con un diseño disponible o proponer un nuevo nombre corto en español. Úsalo solo cuando identifica de forma clara y determinística el producto. Si el diseño es genérico, de inventario o no visible, usa null y designIsDeterministic false.
- Nunca inventes una taxonomía: una propuesta nueva debe describir una característica visible, diferenciable y reutilizable en futuros productos.
- gtin solo puede contener el número completo cuando los dígitos se leen directamente junto al código de barras y el checksum GS1 es válido. No lo deduzcas de las barras, del nombre, ni de otra fuente. Incluye en evidence dónde se ve; de lo contrario usa null.
- mpn solo puede contener una referencia del fabricante copiada exactamente cuando se lee completa en el empaque o producto. Incluye en evidence dónde se ve; de lo contrario usa null.
- variantRecommendation solo debe indicar shouldCreateVariants true cuando las fotos demuestran opciones comprables distintas de color, diseño o tamaño. No confundas un set multicolor, un empaque decorado ni una foto de familia con variantes. axes puede usar solamente COLOR, DESIGN o SIZE y evidence debe explicar la evidencia.
- variantCandidates se usa únicamente cuando variantRecommendation.shouldCreateVariants es true. Incluye una fila por foto que muestre una opción individual y comprable; imageIndex empieza en 0 y respeta el orden de las fotos. Para cada fila confirma solo color, diseño o tamaño visibles que distingan esa opción. Si una foto muestra varias opciones, un surtido, una familia o no identifica una variante individual, no incluyas esa foto. Nunca repitas imageIndex ni inventes atributos. Deben existir al menos dos filas distintas para recomendar variantes.
- observations debe explicar de forma corta la evidencia visual útil. limitations debe mencionar qué no se puede confirmar.
- Nunca sugieras SKU, precios, costos, stock, proveedor, descuentos ni atributos no visibles.
- Esto es una propuesta para revisión humana: no hay ningún cambio automático.`;
}
