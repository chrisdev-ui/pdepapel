import {
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
  MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
  getMercadoLibreCategoryPublicationError,
  isMercadoLibreCategoryId,
  parseMercadoLibreCategoryAttributes,
  parseMercadoLibreCategoryPath,
  type MercadoLibreCategoryAttribute,
  type MercadoLibreCategoryPublicationRequirements,
} from "./categories";
import { requestMercadoLibreJson } from "./client";

export type MercadoLibreCategoryInspection =
  | {
      ok: true;
      categoryId: string;
      attributes: MercadoLibreCategoryAttribute[] | null;
      /** Ruta desde la raíz (nombres) para mostrar junto a la sugerencia. */
      path: string[];
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

export type MercadoLibreCategoryJsonFetcher = (resource: string) => Promise<{ ok: boolean; status: number; payload: unknown }>;

/**
 * Lectura pública (sin token) de `/categories/...`: Mercado Libre la sirve sin
 * autenticación. La usa el ensayo del publicador por tandas para correr la
 * misma validación que el trabajador sin tocar ni renovar el token.
 */
export function publicMercadoLibreCategoryJson(request: typeof fetch = fetch): MercadoLibreCategoryJsonFetcher {
  return async (resource) => {
    const response = await request(`https://api.mercadolibre.com${resource}`, { cache: "no-store" });
    const body = await response.text();
    let payload: unknown = null;
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      payload = null;
    }
    return { ok: response.ok && payload !== null, status: response.status, payload };
  };
}

export async function inspectMercadoLibreCategory(
  connectionId: string,
  categoryId: string,
  {
    includeAttributes = false,
    requirements,
    request = fetch,
    categoryJson,
  }: {
    includeAttributes?: boolean;
    requirements?: MercadoLibreCategoryPublicationRequirements;
    request?: typeof fetch;
    /** Sin él, lectura autenticada de la conexión (la del trabajador). */
    categoryJson?: MercadoLibreCategoryJsonFetcher;
  } = {},
): Promise<MercadoLibreCategoryInspection> {
  const fetchJson: MercadoLibreCategoryJsonFetcher = categoryJson ?? ((resource) => requestMercadoLibreJson(connectionId, resource, request));
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

  const categoryResult = await fetchJson(`/categories/${encodeURIComponent(normalizedCategoryId)}`);
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

  const path = parseMercadoLibreCategoryPath(categoryResult.payload);
  if (!includeAttributes) {
    return {
      ok: true,
      categoryId: normalizedCategoryId,
      attributes: null,
      path,
    };
  }

  const attributesResult = await fetchJson(`/categories/${encodeURIComponent(normalizedCategoryId)}/attributes`);
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
    path,
  };
}

export function getMercadoLibreCategoryInspectionHttpStatus(
  inspection: Exclude<MercadoLibreCategoryInspection, { ok: true }>,
) {
  if (inspection.code === MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED) return 409;
  if (inspection.code === MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED) return 401;
  return 502;
}
