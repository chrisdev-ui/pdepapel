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
  }

  if (step === 3) {
    const attributeValues = parseAttributeValues(attributes);
    const missingAttributes = categoryAttributes.filter(
      (attribute) =>
        attribute.required &&
        !attributeValues.get(attribute.id.toUpperCase()) &&
        !(productHasNoIdentifier && attribute.id.toUpperCase() === "GTIN"),
    );

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

function findEmptyGtinReason(attribute: ListingWizardCategoryAttribute): string | null {
  const values = attribute.values ?? [];
  if (values.length === 0) return null;
  const preferred = values.find((value) =>
    /sin c[oó]digo|no tiene|no posee|no cuenta|not issued|no aplica/i.test(value.name),
  );
  return (preferred ?? values[0]).name;
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
    GTIN: product.hasNoProductIdentifier ? null : product.gtin,
    MPN: product.mpn,
    COLOR: product.colorName,
    SIZE: product.sizeName,
  };
  for (const attribute of categoryAttributes) {
    const id = attribute.id.toUpperCase();
    if (current.has(id)) continue;
    if (id === "EMPTY_GTIN_REASON" && product.hasNoProductIdentifier) {
      const reason = findEmptyGtinReason(attribute);
      if (reason) additions.push(`${id}=${reason}`);
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
