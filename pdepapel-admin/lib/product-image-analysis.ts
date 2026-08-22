import { normalizeProductNamePart } from "@/lib/product-naming";
import { z } from "zod";

export const MAX_PRODUCT_IMAGE_ANALYSIS_IMAGES = 3;
export const PRODUCT_IMAGE_ANALYSIS_DAILY_LIMIT = 12;

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
  brand: z.string().max(120).nullable(),
  colorName: z.string().max(80).nullable(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  colorIsDeterministic: z.boolean(),
  designName: z.string().max(80).nullable(),
  designIsDeterministic: z.boolean(),
  observations: z.array(z.string().max(180)).max(4),
  limitations: z.array(z.string().max(180)).max(3),
});

export type ProductImageAnalysisOutput = z.infer<
  typeof productImageAnalysisOutputSchema
>;

export type ProductImageAnalysis = ProductImageAnalysisOutput & {
  colorId: string | null;
  colorSource: "existing" | "new" | "not_detected";
  designId: string | null;
  designSource: "existing" | "new" | "not_detected";
};

type TaxonomyOption = {
  id: string;
  name: string;
  value?: string;
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

function findExactTaxonomyMatch(
  value: string | null,
  options: TaxonomyOption[],
) {
  const normalizedValue = normalizeForMatching(value);
  if (!normalizedValue) return null;

  return (
    options.find(
      (option) => normalizeForMatching(option.name) === normalizedValue,
    ) ?? null
  );
}

export function sanitizeProductImageAnalysis(
  output: ProductImageAnalysisOutput,
  options: {
    colors: TaxonomyOption[];
    designs: TaxonomyOption[];
  },
): ProductImageAnalysis {
  const suggestedColorName = output.colorIsDeterministic
    ? cleanOptionalText(output.colorName, 80)
    : null;
  const suggestedDesignName = output.designIsDeterministic
    ? cleanOptionalText(output.designName, 80)
    : null;
  const color = findExactTaxonomyMatch(suggestedColorName, options.colors);
  const design = findExactTaxonomyMatch(suggestedDesignName, options.designs);
  const colorHex = cleanColorHex(output.colorHex);

  return {
    suggestedBaseName: cleanOptionalText(output.suggestedBaseName),
    brand: cleanOptionalText(output.brand),
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
  colors: string[];
  designs: string[];
}) {
  const colors = input.colors.join(", ") || "Sin opciones configuradas";
  const designs = input.designs.join(", ") || "Sin opciones configuradas";

  return `Analiza las fotos públicas de un producto de papelería para ayudar a una administradora a completar su catálogo en español de Colombia.

Categoría elegida por la administradora: ${input.categoryName || "Sin categoría"}.
Colores disponibles en el catálogo: ${colors}.
Diseños disponibles en el catálogo: ${designs}.

Reglas obligatorias:
- Describe únicamente elementos, texto y marca que puedas confirmar visualmente. Nunca adivines marca, cantidad, medida, licencia, material o compatibilidad.
- suggestedBaseName debe ser un nombre base breve, profesional y útil para una tienda. No incluyas marca, color, diseño ni códigos internos; deja esos datos en sus campos separados.
- brand debe ser null si no se lee claramente en empaque o producto.
- colorName puede coincidir exactamente con un color disponible o proponer un nuevo nombre corto en español. Úsalo solo cuando la foto representa de forma determinística una variante de un único color. Si propones un color nuevo, colorHex debe ser su tono dominante en formato #RRGGBB. Si es multicolor, pastel, una foto de familia o no estás segura, usa null, colorHex null y colorIsDeterministic false.
- designName puede coincidir exactamente con un diseño disponible o proponer un nuevo nombre corto en español. Úsalo solo cuando identifica de forma clara y determinística el producto. Si el diseño es genérico, de inventario o no visible, usa null y designIsDeterministic false.
- Nunca inventes una taxonomía: una propuesta nueva debe describir una característica visible, diferenciable y reutilizable en futuros productos.
- observations debe explicar de forma corta la evidencia visual útil. limitations debe mencionar qué no se puede confirmar.
- No sugieras GTIN, SKU, precios, stock ni atributos no visibles.
- Esto es una propuesta para revisión humana: no hay ningún cambio automático.`;
}
