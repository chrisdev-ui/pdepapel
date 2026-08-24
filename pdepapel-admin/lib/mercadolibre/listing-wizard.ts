export type ListingWizardStep = 1 | 2 | 3 | 4;

export type ListingWizardCategoryAttribute = {
  id: string;
  required: boolean;
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

export function getListingWizardStepError({
  step,
  productId,
  familyName,
  marketplacePrice,
  categoryId,
  imageUrls,
  attributes,
  categoryAttributes,
}: ListingWizardValidationInput) {
  if (step === 1) {
    if (!productId) return "Selecciona el producto que vas a publicar";
    if (!familyName.trim()) {
      return "Escribe el nombre de familia que verá Mercado Libre";
    }
    if (familyName.trim().length > 120) {
      return "El nombre de familia puede tener máximo 120 caracteres";
    }
    if (
      !Number.isFinite(Number(marketplacePrice)) ||
      Number(marketplacePrice) <= 0
    ) {
      return "Escribe un precio de Mercado Libre mayor que cero";
    }
  }

  if (step === 2) {
    if (!categoryId.trim()) return "Selecciona una categoría de Mercado Libre";
    if (!/^MCO\d+$/i.test(categoryId.trim())) {
      return "Elige una categoría válida de las sugerencias de Mercado Libre";
    }
    if (imageUrls.length === 0)
      return "Selecciona al menos una foto para publicar";
  }

  if (step === 3) {
    const attributeValues = parseAttributeValues(attributes);
    const missingAttributes = categoryAttributes.filter(
      (attribute) =>
        attribute.required && !attributeValues.get(attribute.id.toUpperCase()),
    );

    if (missingAttributes.length > 0) {
      return "Completa los campos obligatorios de la ficha técnica";
    }
  }

  return null;
}
