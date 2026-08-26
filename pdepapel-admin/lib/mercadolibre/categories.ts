type MercadoLibreRecord = Record<string, unknown>;

export const MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED =
  "MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED";
export const MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE =
  "MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE";
export const MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED =
  "MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED";

export type MercadoLibreCategorySuggestion = {
  categoryId: string;
  categoryName: string;
  domainId: string | null;
  domainName: string | null;
};

export type MercadoLibreCategoryAttribute = {
  id: string;
  name: string;
  required: boolean;
  valueType: string;
  values: { id: string; name: string }[];
};

export type MercadoLibreCategoryPublicationRequirements = {
  familyName: string;
  price: number;
  pictureCount: number;
};

function asRecord(value: unknown): MercadoLibreRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MercadoLibreRecord)
    : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function isMercadoLibreCategoryId(value: string) {
  return /^MCO\d+$/i.test(value.trim());
}

export function parseMercadoLibreCategorySuggestions(
  payload: unknown,
): MercadoLibreCategorySuggestion[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item) => {
    const suggestion = asRecord(item);
    if (
      !suggestion ||
      typeof suggestion.category_id !== "string" ||
      typeof suggestion.category_name !== "string" ||
      !isMercadoLibreCategoryId(suggestion.category_id)
    ) {
      return [];
    }

    return [
      {
        categoryId: suggestion.category_id,
        categoryName: suggestion.category_name,
        domainId:
          typeof suggestion.domain_id === "string"
            ? suggestion.domain_id
            : null,
        domainName:
          typeof suggestion.domain_name === "string"
            ? suggestion.domain_name
            : null,
      },
    ];
  });
}

export function parseMercadoLibreCategoryAttributes(
  payload: unknown,
): MercadoLibreCategoryAttribute[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item) => {
    const attribute = asRecord(item);
    if (
      !attribute ||
      typeof attribute.id !== "string" ||
      typeof attribute.name !== "string"
    ) {
      return [];
    }

    const tags = asRecord(attribute.tags);
    if (
      tags?.hidden === true ||
      tags?.read_only === true ||
      tags?.fixed === true ||
      tags?.inferred === true
    ) {
      return [];
    }

    const values = Array.isArray(attribute.values)
      ? attribute.values
          .flatMap((value) => {
            const option = asRecord(value);
            return option &&
              typeof option.id === "string" &&
              typeof option.name === "string"
              ? [{ id: option.id, name: option.name }]
              : [];
          })
          .slice(0, 100)
      : [];

    return [
      {
        id: attribute.id,
        name: attribute.name,
        required: tags?.required === true || tags?.new_required === true,
        valueType:
          typeof attribute.value_type === "string"
            ? attribute.value_type
            : "string",
        values,
      },
    ];
  });
}

export function getMercadoLibreCategoryPublicationError(
  payload: unknown,
  categoryId: string,
  requirements?: MercadoLibreCategoryPublicationRequirements,
) {
  const category = asRecord(payload);
  if (!category || category.id !== categoryId) {
    return "Mercado Libre no reconoció esta categoría. Vuelve a sugerir una categoría y elige una opción de la lista.";
  }

  const children = Array.isArray(category.children_categories)
    ? category.children_categories
    : [];
  if (children.length > 0) {
    return "La categoría seleccionada es muy general. Elige una categoría final desde “Sugerir categoría” para poder publicar.";
  }

  const settings = asRecord(category.settings);
  if (settings?.listing_allowed === false) {
    return "Mercado Libre no permite publicar productos nuevos en esta categoría. Elige otra categoría sugerida.";
  }

  const allowedConditions = getStringArray(settings?.item_conditions);
  if (allowedConditions.length > 0 && !allowedConditions.includes("new")) {
    return "Esta categoría no admite productos nuevos. Elige una categoría sugerida compatible.";
  }

  if (!requirements) return null;

  const maxTitleLength = getFiniteNumber(settings?.max_title_length);
  if (
    maxTitleLength !== null &&
    requirements.familyName.length > maxTitleLength
  ) {
    return `El nombre de familia tiene ${requirements.familyName.length} caracteres y esta categoría permite máximo ${maxTitleLength}. Acórtalo antes de publicar.`;
  }

  const minimumPrice = getFiniteNumber(settings?.minimum_price);
  if (minimumPrice !== null && requirements.price < minimumPrice) {
    return `El precio debe ser mínimo ${minimumPrice} COP para esta categoría.`;
  }

  const maximumPrice = getFiniteNumber(settings?.maximum_price);
  if (maximumPrice !== null && requirements.price > maximumPrice) {
    return `El precio supera el máximo de ${maximumPrice} COP para esta categoría.`;
  }

  const maxPictures = getFiniteNumber(settings?.max_pictures_per_item);
  if (maxPictures !== null && requirements.pictureCount > maxPictures) {
    return `Esta categoría permite máximo ${maxPictures} fotos por publicación.`;
  }

  return null;
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
