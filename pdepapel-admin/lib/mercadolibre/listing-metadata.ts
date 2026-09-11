import { Prisma } from "@prisma/client";

export type MercadoLibreAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

export type MercadoLibrePackageDimensions = {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightGrams: number;
};

export type MercadoLibreSaleConditions = {
  shippingMode: "me2";
  freeShipping: boolean;
  localPickUp: boolean;
  packageDimensions: MercadoLibrePackageDimensions | null;
};

/** Último rechazo al publicar, guardado para que el asistente vuelva al paso y campo exactos. */
export type MercadoLibrePublicationFailureRecord = {
  kind: "review" | "transient" | "reauth" | "unknown";
  step: "producto" | "categoria" | "ficha" | "precio" | null;
  field: string | null;
  message: string;
  code: string | null;
  at: string;
};

export type MercadoLibreBelowCostOverride = {
  reason: string;
  floor: number;
  price: number;
  at: string;
};

export type MercadoLibreListingMetadata = {
  attributes: MercadoLibreAttribute[];
  familyName: string | null;
  publicationError: MercadoLibrePublicationFailureRecord | null;
  /** Autorización explícita para vender por debajo del costo de adquisición. */
  belowCostOverride: MercadoLibreBelowCostOverride | null;
  media: {
    imageUrls: string[];
  } | null;
  quality: {
    videoRecommendationSnoozedUntil: string | null;
  } | null;
  saleConditions: MercadoLibreSaleConditions | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      ),
    ),
  );
}

function getIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function parseMercadoLibreSaleConditions(
  value: unknown,
): MercadoLibreSaleConditions | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.freeShipping !== "boolean" ||
    typeof value.localPickUp !== "boolean"
  ) {
    return null;
  }

  let packageDimensions: MercadoLibrePackageDimensions | null = null;
  if (
    value.packageDimensions !== null &&
    value.packageDimensions !== undefined
  ) {
    if (!isRecord(value.packageDimensions)) return null;
    const heightCm = getPositiveNumber(value.packageDimensions.heightCm);
    const widthCm = getPositiveNumber(value.packageDimensions.widthCm);
    const lengthCm = getPositiveNumber(value.packageDimensions.lengthCm);
    const weightGrams = getPositiveNumber(value.packageDimensions.weightGrams);
    if (
      heightCm === null ||
      widthCm === null ||
      lengthCm === null ||
      weightGrams === null
    ) {
      return null;
    }
    packageDimensions = { heightCm, widthCm, lengthCm, weightGrams };
  }

  return {
    shippingMode: "me2",
    freeShipping: value.freeShipping,
    localPickUp: value.localPickUp,
    packageDimensions,
  };
}

export function normalizeMercadoLibreFamilyName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ")
    : null;
}

export function getMercadoLibreAttributes(
  value: Prisma.JsonValue | null,
): MercadoLibreAttribute[] {
  if (!isRecord(value) || !Array.isArray(value.attributes)) return [];

  return value.attributes.flatMap((attribute) => {
    if (!isRecord(attribute) || typeof attribute.id !== "string") return [];

    const id = attribute.id.trim();
    const valueId =
      typeof attribute.value_id === "string" && attribute.value_id.trim()
        ? attribute.value_id.trim()
        : null;
    const valueName =
      typeof attribute.value_name === "string" && attribute.value_name.trim()
        ? attribute.value_name.trim()
        : null;

    if (!id || (!valueId && !valueName)) return [];

    return [
      {
        id,
        ...(valueId ? { value_id: valueId } : {}),
        ...(valueName ? { value_name: valueName } : {}),
      },
    ];
  });
}

const FAILURE_KINDS = ["review", "transient", "reauth", "unknown"] as const;
const FAILURE_STEPS = ["producto", "categoria", "ficha", "precio"] as const;

export function parseMercadoLibrePublicationFailure(
  value: unknown,
): MercadoLibrePublicationFailureRecord | null {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  const kind = FAILURE_KINDS.find((item) => item === value.kind) ?? "unknown";
  const step = FAILURE_STEPS.find((item) => item === value.step) ?? null;
  return {
    kind,
    step,
    field: typeof value.field === "string" ? value.field : null,
    message: value.message,
    code: typeof value.code === "string" ? value.code : null,
    at: getIsoDate(value.at) ?? new Date(0).toISOString(),
  };
}

/**
 * Escribe (o borra con `null`) el último rechazo de publicación sin tocar el
 * resto de la metadata. Se usa fuera del constructor normal porque ocurre en
 * la cola, donde no hay formulario.
 */
export function withMercadoLibrePublicationFailure(
  current: Prisma.JsonValue | null,
  failure: Omit<MercadoLibrePublicationFailureRecord, "at"> | null,
): Prisma.InputJsonValue {
  const base = isRecord(current) ? { ...current } : {};
  delete base.publicationError;
  if (!failure) return base as Prisma.InputJsonValue;
  return {
    ...base,
    publicationError: { ...failure, at: new Date().toISOString() },
  } as Prisma.InputJsonValue;
}

export function parseMercadoLibreBelowCostOverride(
  value: unknown,
): MercadoLibreBelowCostOverride | null {
  if (!isRecord(value) || typeof value.reason !== "string" || !value.reason.trim()) {
    return null;
  }
  const floor = getPositiveNumber(value.floor);
  const price = getPositiveNumber(value.price);
  if (floor === null || price === null) return null;
  return {
    reason: value.reason.trim(),
    floor,
    price,
    at: getIsoDate(value.at) ?? new Date(0).toISOString(),
  };
}

export function getMercadoLibreListingMetadata(
  value: Prisma.JsonValue | null,
): MercadoLibreListingMetadata {
  const media = isRecord(value) && isRecord(value.media) ? value.media : null;
  const quality =
    isRecord(value) && isRecord(value.quality) ? value.quality : null;
  const imageUrls = media ? getStringArray(media.imageUrls) : [];
  const familyName = isRecord(value)
    ? normalizeMercadoLibreFamilyName(value.familyName)
    : null;
  const videoRecommendationSnoozedUntil = quality
    ? getIsoDate(quality.videoRecommendationSnoozedUntil)
    : null;
  const saleConditions = isRecord(value)
    ? parseMercadoLibreSaleConditions(value.saleConditions)
    : null;

  return {
    attributes: getMercadoLibreAttributes(value),
    familyName,
    publicationError: isRecord(value)
      ? parseMercadoLibrePublicationFailure(value.publicationError)
      : null,
    belowCostOverride: isRecord(value)
      ? parseMercadoLibreBelowCostOverride(value.belowCostOverride)
      : null,
    media: imageUrls.length > 0 ? { imageUrls } : null,
    quality: videoRecommendationSnoozedUntil
      ? { videoRecommendationSnoozedUntil }
      : null,
    saleConditions,
  };
}

export function buildMercadoLibreListingMetadata({
  current,
  attributes,
  familyName,
  imageUrls,
  videoRecommendationSnoozedUntil,
  saleConditions,
  belowCostOverride,
}: {
  current: Prisma.JsonValue | null;
  attributes?: MercadoLibreAttribute[];
  familyName?: string | null;
  imageUrls?: string[];
  videoRecommendationSnoozedUntil?: string | null;
  saleConditions?: MercadoLibreSaleConditions | null;
  /** `undefined` conserva la autorización actual; `null` la retira. */
  belowCostOverride?: MercadoLibreBelowCostOverride | null;
}): Prisma.InputJsonValue {
  const currentMetadata = getMercadoLibreListingMetadata(current);
  const normalizedImages =
    imageUrls === undefined
      ? currentMetadata.media?.imageUrls
      : getStringArray(imageUrls);
  const normalizedVideoReminder =
    videoRecommendationSnoozedUntil === undefined
      ? currentMetadata.quality?.videoRecommendationSnoozedUntil
      : getIsoDate(videoRecommendationSnoozedUntil);
  const normalizedFamilyName =
    familyName === undefined
      ? currentMetadata.familyName
      : normalizeMercadoLibreFamilyName(familyName);
  const normalizedSaleConditions =
    saleConditions === undefined
      ? currentMetadata.saleConditions
      : saleConditions;
  const normalizedBelowCostOverride =
    belowCostOverride === undefined
      ? currentMetadata.belowCostOverride
      : belowCostOverride;

  return {
    attributes: attributes ?? currentMetadata.attributes,
    ...(currentMetadata.publicationError
      ? { publicationError: currentMetadata.publicationError }
      : {}),
    ...(normalizedBelowCostOverride
      ? { belowCostOverride: normalizedBelowCostOverride }
      : {}),
    ...(normalizedFamilyName ? { familyName: normalizedFamilyName } : {}),
    ...(normalizedImages?.length
      ? { media: { imageUrls: normalizedImages } }
      : {}),
    ...(normalizedVideoReminder
      ? {
          quality: {
            videoRecommendationSnoozedUntil: normalizedVideoReminder,
          },
        }
      : {}),
    ...(normalizedSaleConditions
      ? { saleConditions: normalizedSaleConditions }
      : {}),
  } as Prisma.InputJsonValue;
}

export function getMercadoLibreListingImageUrls(
  productImages: { url: string }[],
  metadata: Prisma.JsonValue | null,
) {
  const availableUrls = Array.from(
    new Set(
      productImages.flatMap((image) =>
        typeof image.url === "string" && image.url.trim()
          ? [image.url.trim()]
          : [],
      ),
    ),
  );
  const selectedUrls =
    getMercadoLibreListingMetadata(metadata).media?.imageUrls;

  if (!selectedUrls?.length) return availableUrls;

  const available = new Set(availableUrls);
  const resolved = selectedUrls.filter((url) => available.has(url));
  return resolved.length > 0 ? resolved : availableUrls;
}
