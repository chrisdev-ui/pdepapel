import {
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
  MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
  getMercadoLibreCategoryPublicationError,
  isMercadoLibreCategoryId,
  parseMercadoLibreCategoryAttributes,
  type MercadoLibreCategoryAttribute,
  type MercadoLibreCategoryPublicationRequirements,
} from "./categories";
import { requestMercadoLibreJson } from "./client";

export type MercadoLibreCategoryInspection =
  | {
      ok: true;
      categoryId: string;
      attributes: MercadoLibreCategoryAttribute[] | null;
    }
  | {
      ok: false;
      categoryId: string;
      code:
        | typeof MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED
        | typeof MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE
        | typeof MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED;
      message: string;
      upstreamStatus: number;
    };

function getLookupFailure(
  categoryId: string,
  status: number,
): MercadoLibreCategoryInspection {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      categoryId,
      code: MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
      message:
        "Mercado Libre no autorizó la validación. Reconecta la cuenta y vuelve a intentarlo.",
      upstreamStatus: status,
    };
  }

  if (status === 404) {
    return {
      ok: false,
      categoryId,
      code: MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
      message: `La categoría ${categoryId} ya no está disponible para publicar. Usa “Sugerir categoría” y elige una opción verificada por Mercado Libre.`,
      upstreamStatus: status,
    };
  }

  return {
    ok: false,
    categoryId,
    code: MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
    message:
      "Mercado Libre no permitió validar la categoría en este momento. No guardamos cambios; intenta nuevamente en unos minutos.",
    upstreamStatus: status,
  };
}

export async function inspectMercadoLibreCategory(
  connectionId: string,
  categoryId: string,
  {
    includeAttributes = false,
    requirements,
    request = fetch,
  }: {
    includeAttributes?: boolean;
    requirements?: MercadoLibreCategoryPublicationRequirements;
    request?: typeof fetch;
  } = {},
): Promise<MercadoLibreCategoryInspection> {
  const normalizedCategoryId = categoryId.trim().toUpperCase();
  if (!isMercadoLibreCategoryId(normalizedCategoryId)) {
    return {
      ok: false,
      categoryId: normalizedCategoryId,
      code: MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
      message:
        "La categoría de Mercado Libre no es válida. Usa “Sugerir categoría” y elige una opción de la lista.",
      upstreamStatus: 400,
    };
  }

  const categoryResult = await requestMercadoLibreJson(
    connectionId,
    `/categories/${encodeURIComponent(normalizedCategoryId)}`,
    request,
  );
  if (!categoryResult.ok) {
    return getLookupFailure(normalizedCategoryId, categoryResult.status);
  }

  const categoryError = getMercadoLibreCategoryPublicationError(
    categoryResult.payload,
    normalizedCategoryId,
    requirements,
  );
  if (categoryError) {
    return {
      ok: false,
      categoryId: normalizedCategoryId,
      code: MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
      message: categoryError,
      upstreamStatus: 400,
    };
  }

  if (!includeAttributes) {
    return {
      ok: true,
      categoryId: normalizedCategoryId,
      attributes: null,
    };
  }

  const attributesResult = await requestMercadoLibreJson(
    connectionId,
    `/categories/${encodeURIComponent(normalizedCategoryId)}/attributes`,
    request,
  );
  if (!attributesResult.ok) {
    return getLookupFailure(normalizedCategoryId, attributesResult.status);
  }
  if (!Array.isArray(attributesResult.payload)) {
    return {
      ok: false,
      categoryId: normalizedCategoryId,
      code: MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
      message:
        "Mercado Libre devolvió una ficha técnica inválida. No guardamos cambios; intenta nuevamente más tarde.",
      upstreamStatus: 502,
    };
  }

  return {
    ok: true,
    categoryId: normalizedCategoryId,
    attributes: parseMercadoLibreCategoryAttributes(attributesResult.payload),
  };
}

export function getMercadoLibreCategoryInspectionHttpStatus(
  inspection: Exclude<MercadoLibreCategoryInspection, { ok: true }>,
) {
  if (inspection.code === MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED) return 409;
  if (inspection.code === MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED) return 401;
  return 502;
}
