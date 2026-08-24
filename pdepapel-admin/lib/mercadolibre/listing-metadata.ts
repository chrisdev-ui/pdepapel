import { Prisma } from "@prisma/client";

export type MercadoLibreAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

export type MercadoLibreListingMetadata = {
  attributes: MercadoLibreAttribute[];
  familyName: string | null;
  media: {
    imageUrls: string[];
  } | null;
  quality: {
    videoRecommendationSnoozedUntil: string | null;
  } | null;
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

  return {
    attributes: getMercadoLibreAttributes(value),
    familyName,
    media: imageUrls.length > 0 ? { imageUrls } : null,
    quality: videoRecommendationSnoozedUntil
      ? { videoRecommendationSnoozedUntil }
      : null,
  };
}

export function buildMercadoLibreListingMetadata({
  current,
  attributes,
  familyName,
  imageUrls,
  videoRecommendationSnoozedUntil,
}: {
  current: Prisma.JsonValue | null;
  attributes?: MercadoLibreAttribute[];
  familyName?: string | null;
  imageUrls?: string[];
  videoRecommendationSnoozedUntil?: string | null;
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

  return {
    attributes: attributes ?? currentMetadata.attributes,
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
