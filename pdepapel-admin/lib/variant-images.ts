// Sin Prisma: también lo usa la grilla de variantes en el navegador.

export interface ImageMappingEntry {
  url: string;
  scope: string;
}

/** null = fila anterior al origen; cuenta como OWN. */
export type ImageOriginValue = "OWN" | "GROUP_COPY";

export interface GroupPhoto {
  url: string;
  isMain?: boolean;
  scope?: string | null;
}

export interface GalleryPhoto {
  url: string;
  isMain: boolean;
  fromGroup: boolean;
}

interface ResolveVariantImagesOptions {
  /** Fotos propias (OWN y sin origen), en su orden. */
  variantImages?: (string | { url: string; isMain?: boolean })[] | null;
  groupImages: GroupPhoto[];
  /** Manda sobre el `scope` guardado en cada foto del grupo. */
  imageMapping?: ImageMappingEntry[] | null;
  colorId?: string | null;
  designId?: string | null;
  currentCoverUrl?: string | null;
}

/** Acepta el id suelto de color o diseño además de los prefijos. */
export function scopeAppliesTo(
  scope: string | null | undefined,
  colorId?: string | null,
  designId?: string | null,
): boolean {
  if (!scope || scope === "all") return true;
  if (scope.startsWith("COMBO|")) {
    const [, cId, dId] = scope.split("|");
    return colorId === cId && designId === dId;
  }
  if (scope.startsWith("COLOR|")) return colorId === scope.slice("COLOR|".length);
  if (scope.startsWith("DESIGN|")) return designId === scope.slice("DESIGN|".length);
  return scope === colorId || scope === designId;
}

export function scopeOf(photo: GroupPhoto, imageMapping?: ImageMappingEntry[] | null): string | null {
  const entry = imageMapping?.find((mapping) => mapping.url === photo.url);
  return entry ? entry.scope : (photo.scope ?? null);
}

/**
 * Propias primero, luego las del grupo que le tocan (en su orden, sin repetir
 * dirección). Una sola portada: la actual si sigue; si no, la propia marcada;
 * sin propias, la primera portada del grupo que le toca; si no, la primera.
 */
export function resolveVariantImages({
  variantImages,
  groupImages,
  imageMapping,
  colorId,
  designId,
  currentCoverUrl,
}: ResolveVariantImagesOptions): GalleryPhoto[] {
  const own: { url: string; isMain: boolean }[] = [];
  const seen = new Set<string>();
  for (const image of variantImages ?? []) {
    const url = (typeof image === "string" ? image : image.url).trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    own.push({ url, isMain: typeof image === "string" ? false : Boolean(image.isMain) });
  }

  const copies: { url: string; isMain: boolean }[] = [];
  for (const photo of groupImages) {
    const url = photo.url.trim();
    if (!url || seen.has(url)) continue;
    if (!scopeAppliesTo(scopeOf(photo, imageMapping), colorId, designId)) continue;
    seen.add(url);
    copies.push({ url, isMain: Boolean(photo.isMain) });
  }

  const gallery: GalleryPhoto[] = [
    ...own.map((image) => ({ url: image.url, isMain: false, fromGroup: false })),
    ...copies.map((image) => ({ url: image.url, isMain: false, fromGroup: true })),
  ];
  if (gallery.length === 0) return gallery;

  const coverUrl =
    (currentCoverUrl && seen.has(currentCoverUrl.trim()) ? currentCoverUrl.trim() : null) ??
    own.find((image) => image.isMain)?.url ??
    (own.length === 0 ? copies.find((image) => image.isMain)?.url : undefined) ??
    gallery[0].url;
  return gallery.map((image) => ({ ...image, isMain: image.url === coverUrl }));
}

export function withVariantCover<T extends { url: string; isMain?: boolean }>(
  images: T[],
): (T & { isMain: boolean })[] {
  const firstMain = images.findIndex((image) => image.isMain);
  const cover = firstMain >= 0 ? firstMain : 0;
  return images.map((image, index) => ({ ...image, isMain: images.length > 0 && index === cover }));
}

/** Clave sin orden ni repetidos para comparar juegos de fotos. */
export function imageUrlKey(urls: string[]): string {
  return Array.from(new Set(urls.map((url) => url.trim())))
    .sort()
    .join("\n");
}
