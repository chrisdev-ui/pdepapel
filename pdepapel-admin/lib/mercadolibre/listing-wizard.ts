import {
  describeBelowCostReasonError,
  isPriceBelowCost,
  validateBelowCostReason,
} from "./listing-price-guard";

export type ListingWizardStep = 1 | 2 | 3 | 4;

/** Pasos del asistente, en orden; el diálogo y el indicador usan el mismo nombre. */
export const LISTING_WIZARD_STEPS: readonly {
  number: ListingWizardStep;
  label: string;
}[] = [
  { number: 1, label: "Producto" },
  { number: 2, label: "Categoría y fotos" },
  { number: 3, label: "Ficha técnica" },
  { number: 4, label: "Revisar y publicar" },
];

export function getListingWizardStepLabel(step: ListingWizardStep): string {
  return LISTING_WIZARD_STEPS.find((item) => item.number === step)?.label ?? "";
}

export type ListingWizardCategoryAttribute = {
  id: string;
  required: boolean;
  /** Mercado Libre lo exige según el resto de la ficha (GTIN o su motivo, cantidad por pack…). */
  conditionalRequired?: boolean;
  /** Mercado Libre lo pide para su catálogo; sin él hay advertencia, no rechazo. */
  catalogRequired?: boolean;
  /** Opciones cerradas de Mercado Libre, si el atributo las tiene. */
  values?: readonly { id: string; name: string }[];
};

/** Campos del asistente a los que puede apuntar un error. */
export type ListingWizardField =
  | "productId"
  | "familyName"
  | "marketplacePrice"
  | "categoryId"
  | "imageUrls"
  | "attributes"
  | "belowCostReason"
  | `attribute:${string}`;

export type ListingWizardIssue = {
  step: ListingWizardStep;
  field: ListingWizardField;
  message: string;
};

/** Tope de fotos que el panel envía; cada categoría puede pedir menos (`max_pictures_per_item`). */
export const MERCADOLIBRE_MAX_LISTING_PICTURES = 10;

/** Lado mínimo de una foto según Mercado Libre (500 × 500 px). */
export const MERCADOLIBRE_MIN_PICTURE_SIDE = 500;

/** Tamaño real de la foto que descargará Mercado Libre, o su estado de carga. */
export type ListingWizardImageCheck = { width: number; height: number } | "pending" | "error";

export type ListingWizardValidationInput = {
  step: ListingWizardStep;
  productId: string;
  familyName: string;
  marketplacePrice: string;
  categoryId: string;
  imageUrls: readonly string[];
  attributes: string;
  categoryAttributes: readonly ListingWizardCategoryAttribute[];
  /** Costo de adquisición del producto elegido, si se conoce. */
  acquisitionCost?: number | null;
  /** Envío y otros gastos por unidad del producto elegido. */
  transportationCost?: number | null;
  /** Motivo escrito para publicar por debajo del costo. */
  belowCostReason?: string;
  /** El producto está marcado «sin identificador»: un GTIN obligatorio queda cubierto. */
  productHasNoIdentifier?: boolean;
  /** Marca registrada sin GTIN en el producto: la ficha exige el código antes de validar. */
  brandRequiringGtin?: string | null;
  /** Tamaño de cada foto elegida; sin este dato no se revisa el tamaño. */
  imageChecks?: Readonly<Record<string, ListingWizardImageCheck>>;
  /** Máximo de fotos de la categoría (`max_pictures_per_item`). */
  maxPictures?: number | null;
};

function parseAttributeValues(value: string) {
  const values = new Map<string, string>();

  for (const line of value.split("\n")) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const id = line.slice(0, separatorIndex).trim().toUpperCase();
    const attributeValue = line.slice(separatorIndex + 1).trim();
    if (id && attributeValue) values.set(id, attributeValue);
  }

  return values;
}

/** Mensaje plano del primer problema del paso (compatibilidad). */
export function getListingWizardStepError(input: ListingWizardValidationInput) {
  return getListingWizardStepIssue(input)?.message ?? null;
}

/**
 * Primer problema del paso, con el campo al que pertenece: el asistente lo
 * muestra junto al campo y lo enfoca, en vez de un aviso genérico arriba.
 */
export function getListingWizardStepIssue({
  step,
  productId,
  familyName,
  marketplacePrice,
  categoryId,
  imageUrls,
  attributes,
  categoryAttributes,
  acquisitionCost = null,
  transportationCost = null,
  belowCostReason = "",
  productHasNoIdentifier = false,
  brandRequiringGtin = null,
  imageChecks,
  maxPictures = null,
}: ListingWizardValidationInput): ListingWizardIssue | null {
  const issue = (field: ListingWizardField, message: string): ListingWizardIssue => ({
    step,
    field,
    message,
  });
  if (step === 1) {
    if (!productId) return issue("productId", "Selecciona el producto que vas a publicar");
    if (!familyName.trim()) {
      return issue("familyName", "Escribe el nombre de familia que verá Mercado Libre");
    }
    if (familyName.trim().length > 120) {
      return issue("familyName", "El nombre de familia puede tener máximo 120 caracteres");
    }
    if (
      !Number.isFinite(Number(marketplacePrice)) ||
      Number(marketplacePrice) <= 0
    ) {
      return issue("marketplacePrice", "Escribe un precio de Mercado Libre mayor que cero");
    }
  }

  if (step === 2) {
    if (!categoryId.trim()) return issue("categoryId", "Selecciona una categoría de Mercado Libre");
    if (!/^MCO\d+$/i.test(categoryId.trim())) {
      return issue("categoryId", "Elige una categoría válida de las sugerencias de Mercado Libre");
    }
    if (imageUrls.length === 0)
      return issue("imageUrls", "Selecciona al menos una foto para publicar");
    if (maxPictures && imageUrls.length > maxPictures) {
      return issue("imageUrls", `Mercado Libre acepta máximo ${maxPictures} fotos en esta categoría. Quita ${imageUrls.length - maxPictures}.`);
    }
    if (imageChecks) {
      const min = MERCADOLIBRE_MIN_PICTURE_SIDE;
      for (let index = 0; index < imageUrls.length; index += 1) {
        const url = imageUrls[index];
        const check = imageChecks[url] ?? "pending";
        if (check === "pending") {
          return issue("imageUrls", "Revisando el tamaño de las fotos; espera un momento.");
        }
        if (check === "error") {
          return issue("imageUrls", `La foto ${index + 1} no se pudo cargar. Quítala o vuelve a intentarlo.`);
        }
        if (check.width < min || check.height < min) {
          return issue(
            "imageUrls",
            `La foto ${index + 1} mide ${check.width} × ${check.height} px; Mercado Libre pide al menos ${min} × ${min} px. Quítala o reemplázala por una más grande.`,
          );
        }
      }
    }
  }

  if (step === 3) {
    const attributeValues = parseAttributeValues(attributes);
    const missingAttributes = categoryAttributes.filter(
      (attribute) =>
        attribute.required &&
        !attributeValues.get(attribute.id.toUpperCase()) &&
        !(productHasNoIdentifier && attribute.id.toUpperCase() === "GTIN"),
    );

    const gtinAttribute = categoryAttributes.find((attribute) => attribute.id.toUpperCase() === "GTIN");
    if (
      brandRequiringGtin &&
      gtinAttribute &&
      (gtinAttribute.required || gtinAttribute.conditionalRequired) &&
      !attributeValues.get("GTIN")
    ) {
      return issue(
        "attribute:GTIN",
        `«${brandRequiringGtin}» es una marca registrada: Mercado Libre exige su código de barras real (GTIN). Escríbelo aquí o agrégalo en el producto.`,
      );
    }

    const emptyReason = categoryAttributes.find((attribute) => attribute.id.toUpperCase() === "EMPTY_GTIN_REASON");
    if (
      missingAttributes.length === 0 &&
      productHasNoIdentifier &&
      emptyReason &&
      !attributeValues.get("GTIN") &&
      !attributeValues.get("EMPTY_GTIN_REASON")
    ) {
      return issue(
        "attribute:EMPTY_GTIN_REASON",
        "Escribe el código de barras (GTIN) o elige el motivo por el que el producto no lo tiene.",
      );
    }

    if (missingAttributes.length > 0) {
      const first = missingAttributes[0].id.toUpperCase();
      return issue(
        `attribute:${first}`,
        missingAttributes.length === 1
          ? `Completa «${first}» en la ficha técnica`
          : `Completa los campos obligatorios de la ficha técnica: ${missingAttributes
              .map((attribute) => attribute.id.toUpperCase())
              .join(", ")}`,
      );
    }
  }

  if (step === 4) {
    const price = Number(marketplacePrice);
    if (
      Number.isFinite(price) &&
      isPriceBelowCost(price, { acqPrice: acquisitionCost, transportationCost })
    ) {
      const reasonError = validateBelowCostReason(belowCostReason);
      if (reasonError) {
        return issue(
          "belowCostReason",
          `El precio está por debajo del costo por unidad. ${describeBelowCostReasonError(reasonError)}`,
        );
      }
    }
  }

  return null;
}

/** Paso 1–4 a partir del nombre guardado por la cola de publicación. */
export function wizardStepFromPublicationStep(
  step: "producto" | "categoria" | "ficha" | "precio" | null | undefined,
): ListingWizardStep | null {
  switch (step) {
    case "producto":
      return 1;
    case "categoria":
      return 2;
    case "ficha":
      return 3;
    case "precio":
      return 4;
    default:
      return null;
  }
}

/**
 * Dónde abrir el asistente: en el paso que Mercado Libre rechazó, o en el
 * primer paso incompleto. Un borrador nunca vuelve a empezar desde cero.
 */
export function getInitialListingWizardStep(input: {
  productId: string;
  familyName: string;
  marketplacePrice: string;
  categoryId: string;
  imageUrls: readonly string[];
  publicationErrorStep?: "producto" | "categoria" | "ficha" | "precio" | null;
}): ListingWizardStep {
  const fromFailure = wizardStepFromPublicationStep(input.publicationErrorStep);
  if (fromFailure) return fromFailure;
  if (!input.productId || !input.familyName.trim()) return 1;
  if (!/^MCO\d+$/i.test(input.categoryId.trim()) || input.imageUrls.length === 0) return 2;
  return 3;
}

export type ListingWizardPrefillProduct = {
  isKit?: boolean;
  brand?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  hasNoProductIdentifier?: boolean;
};

function findAllowedValue(
  attribute: ListingWizardCategoryAttribute,
  candidate: string,
): string | null {
  const values = attribute.values ?? [];
  if (values.length === 0) return candidate;
  const normalized = candidate.trim().toLowerCase();
  const match = values.find((value) => value.name.trim().toLowerCase() === normalized);
  return match ? match.name : null;
}

/** Ids de MCO: «El producto no tiene código registrado» y «El producto es un kit o un pack». */
const EMPTY_GTIN_REASON_NOT_REGISTERED = "17055160";
const EMPTY_GTIN_REASON_KIT = "17055159";

function findEmptyGtinReason(attribute: ListingWizardCategoryAttribute, isKit: boolean): string | null {
  const values = attribute.values ?? [];
  if (values.length === 0) return null;
  const byId = values.find((value) => value.id === (isKit ? EMPTY_GTIN_REASON_KIT : EMPTY_GTIN_REASON_NOT_REGISTERED));
  if (byId) return byId.name;
  const byName = values.find((value) =>
    isKit ? /kit|pack/i.test(value.name) : /sin c[oó]digo|no tiene|no posee|no cuenta|not issued|no aplica/i.test(value.name),
  );
  return (byName ?? values[0]).name;
}

const GENERIC_OR_OWN_BRAND = /^(gen[eé]ric[ao]|sin marca|p de papel|papeler[ií]a p de papel)$/i;

/**
 * Sin código de barras, una marca genérica o la propia se publica con el
 * motivo «no tiene código registrado». Una marca conocida (Norma, por
 * ejemplo) tiene código: Mercado Libre lo exige y no se inventa un motivo.
 */
export function shouldUseEmptyGtinReason(product: { gtin?: string | null; brand?: string | null; hasNoProductIdentifier?: boolean }) {
  // Con un GTIN guardado manda la bandera: «sin identificador» dice que ese código no es legítimo.
  if (product.gtin?.trim()) return Boolean(product.hasNoProductIdentifier);
  // Sin GTIN, una marca conocida tiene código aunque la ficha diga «sin identificador».
  return !isKnownBrand(product.brand);
}

export function isKnownBrand(brand: string | null | undefined) {
  return Boolean(brand?.trim()) && !GENERIC_OR_OWN_BRAND.test(String(brand).trim());
}

export function getGtinGuidance(product: { gtin?: string | null; brand?: string | null; hasNoProductIdentifier?: boolean }): string | null {
  if (product.gtin?.trim() && !product.hasNoProductIdentifier) return null;
  if (shouldUseEmptyGtinReason(product)) {
    return "Sin código de barras: se publica como «El producto no tiene código registrado», porque la marca es genérica o propia.";
  }
  const brand = product.brand?.trim();
  return product.hasNoProductIdentifier
    ? `El producto está marcado «sin identificador», pero «${brand}» es una marca registrada: Mercado Libre exige su código de barras real (GTIN). Agrégalo en el producto antes de publicar.`
    : `«${brand}» es una marca conocida: Mercado Libre pide su código de barras real (GTIN). Agrégalo en el producto antes de publicar.`;
}

/** «Genérica» solo donde la categoría la acepta: marca de texto libre o una lista que la incluye. */
function genericBrand(attribute: ListingWizardCategoryAttribute): string | null {
  const values = attribute.values ?? [];
  if (values.length === 0) return "Genérica";
  return values.find((value) => /^gen[eé]ric[ao]$/i.test(value.name.trim()))?.name ?? null;
}

/** Nombre de familia por defecto: el del grupo para una variante, si no el del producto. */
export function defaultListingFamilyName(product: { name: string; productGroupName?: string | null }) {
  return product.productGroupName?.trim() || product.name.trim();
}

const NON_STATIONERY_DOMAIN = /SKIN|BEAUTY|MAKEUP|COSMETIC|HAIR|NAIL|PERFUME|FRAGRANCE|BATH|SHAVING|HEALTH|SUPPLEMENT|PET_|FOOD|AUTO/i;

/** Aviso para una sugerencia de categoría que no corresponde a un kit de papelería. */
export function getCategorySuggestionWarning(
  suggestion: { domainId: string | null; domainName: string | null },
  product: { isKit?: boolean },
): string | null {
  if (!product.isKit || !suggestion.domainId || !NON_STATIONERY_DOMAIN.test(suggestion.domainId)) return null;
  return `Revisa: esta categoría no parece de papelería (es de «${suggestion.domainName ?? suggestion.domainId}»). Busca otra con el nombre del contenido del kit.`;
}

/**
 * Rellena la ficha técnica con lo que el producto ya sabe: marca, GTIN, MPN,
 * color y tamaño. Solo escribe atributos vacíos, nunca pisa lo tecleado, y
 * para listas cerradas solo cuando el valor del producto coincide con una
 * opción (no se adivina). Un producto sin identificador rellena
 * EMPTY_GTIN_REASON si la categoría lo ofrece.
 */
export function prefillListingAttributes(
  attributesText: string,
  categoryAttributes: readonly ListingWizardCategoryAttribute[],
  product: ListingWizardPrefillProduct,
): string {
  const current = parseAttributeValues(attributesText);
  const additions: string[] = [];
  const candidates: Record<string, string | null | undefined> = {
    BRAND: product.brand,
    GTIN: shouldUseEmptyGtinReason(product) ? null : product.gtin,
    MPN: product.mpn,
    COLOR: product.colorName,
    SIZE: product.sizeName,
  };
  for (const attribute of categoryAttributes) {
    const id = attribute.id.toUpperCase();
    if (current.has(id)) continue;
    if (id === "EMPTY_GTIN_REASON") {
      if (!shouldUseEmptyGtinReason(product)) continue;
      const reason = findEmptyGtinReason(attribute, Boolean(product.isKit));
      if (reason) additions.push(`${id}=${reason}`);
      continue;
    }
    if (id === "BRAND" && !product.brand?.trim()) {
      const brand = genericBrand(attribute);
      if (brand) additions.push(`${id}=${brand}`);
      continue;
    }
    const candidate = candidates[id];
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const value = findAllowedValue(attribute, candidate);
    if (value) additions.push(`${id}=${value}`);
  }
  if (additions.length === 0) return attributesText;
  const base = attributesText.trim();
  return base ? `${base}\n${additions.join("\n")}` : additions.join("\n");
}
