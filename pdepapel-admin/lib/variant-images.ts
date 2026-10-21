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
  /** La portada del grupo puesta como respaldo: la variante no tiene otra foto. */
  groupCover?: boolean;
}

/**
 * La portada del grupo (la foto principal, con todos los colores y diseños)
 * es del grupo: no se reparte. `writeGroupPhotos` la guarda con este alcance,
 * y una foto principal cuenta como tal aunque su alcance guardado sea otro.
 */
export const GROUP_ONLY_SCOPE = "GROUP_ONLY";

const isGroupCover = (photo: GroupPhoto, imageMapping?: ImageMappingEntry[] | null) =>
  Boolean(photo.isMain) || scopeOf(photo, imageMapping) === GROUP_ONLY_SCOPE;

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
  if (scope === GROUP_ONLY_SCOPE) return false;
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
 * dirección), sin la portada del grupo. Si con eso la variante no tiene
 * ninguna foto (ni propia ni repartida), recibe la portada del grupo como
 * respaldo para no quedar vacía; al tener una foto propia, la pierde en el
 * siguiente guardado. Una sola portada: la actual si sigue; si no, la propia
 * marcada; si no, la primera.
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

  const copies: { url: string; groupCover: boolean }[] = [];
  for (const photo of groupImages) {
    const url = photo.url.trim();
    if (!url || seen.has(url) || isGroupCover(photo, imageMapping)) continue;
    if (!scopeAppliesTo(scopeOf(photo, imageMapping), colorId, designId)) continue;
    seen.add(url);
    copies.push({ url, groupCover: false });
  }
  if (own.length === 0 && copies.length === 0) {
    const cover = groupImages.find((photo) => photo.url.trim() && isGroupCover(photo, imageMapping));
    if (cover) {
      seen.add(cover.url.trim());
      copies.push({ url: cover.url.trim(), groupCover: true });
    }
  }

  const gallery: GalleryPhoto[] = [
    ...own.map((image) => ({ url: image.url, isMain: false, fromGroup: false })),
    ...copies.map((image) => ({ url: image.url, isMain: false, fromGroup: true, ...(image.groupCover ? { groupCover: true } : {}) })),
  ];
  if (gallery.length === 0) return gallery;

  const coverUrl =
    (currentCoverUrl && seen.has(currentCoverUrl.trim()) ? currentCoverUrl.trim() : null) ??
    own.find((image) => image.isMain)?.url ??
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

/**
 * La variante solo muestra la portada del grupo: como respaldo, o porque su
 * única foto propia es esa misma imagen. Es lo que el panel marca «Sin foto
 * propia».
 */
export function showsOnlyGroupCover(gallery: Pick<GalleryPhoto, "url" | "groupCover">[], groupCoverUrls: string[]): boolean {
  if (gallery.length === 0) return false;
  const covers = new Set(groupCoverUrls.map((url) => url.trim()).filter(Boolean));
  return gallery.every((image) => image.groupCover || covers.has(image.url.trim()));
}

/** Las direcciones de la portada del grupo (sus fotos principales). */
export const groupCoverUrls = (groupImages: GroupPhoto[]) =>
  groupImages.filter((photo) => photo.isMain || photo.scope === GROUP_ONLY_SCOPE).map((photo) => photo.url.trim());

/** Clave sin orden ni repetidos para comparar juegos de fotos. */
export function imageUrlKey(urls: string[]): string {
  return Array.from(new Set(urls.map((url) => url.trim())))
    .sort()
    .join("\n");
}
