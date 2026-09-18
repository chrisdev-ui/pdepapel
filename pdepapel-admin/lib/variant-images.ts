export interface ImageMappingEntry {
  url: string;
  scope: string;
}

interface ResolveVariantImagesOptions {
  /** Imágenes puestas a mano en la variante: mandan sobre el reparto. */
  variantImages?: (string | { url: string })[] | null;
  /** Imágenes del grupo con su alcance (`all`, `COMBO|color|diseño`, `COLOR|id`, `DESIGN|id` o un id suelto). */
  groupImages: { url: string; isMain?: boolean }[];
  imageMapping?: ImageMappingEntry[] | null;
  colorId?: string | null;
  designId?: string | null;
}

/**
 * Qué imágenes le tocan a una variante. El formulario guarda el alcance como
 * id suelto de color o diseño y la ruta de creación sólo entendía los
 * prefijos `COLOR|`/`DESIGN|`: una foto de un solo color acababa en todas las
 * variantes. Una sola regla para crear, editar y avisar de duplicados.
 */
export function resolveVariantImages({
  variantImages,
  groupImages,
  imageMapping,
  colorId,
  designId,
}: ResolveVariantImagesOptions): { url: string; isMain?: boolean }[] {
  if (variantImages && variantImages.length > 0) {
    return variantImages.map((image) =>
      typeof image === "string" ? { url: image } : { url: image.url },
    );
  }
  return groupImages.filter((image) => {
    const mapping = imageMapping?.find((entry) => entry.url === image.url);
    if (!mapping || mapping.scope === "all") return true;
    const scope = mapping.scope;
    if (scope.startsWith("COMBO|")) {
      const [, cId, dId] = scope.split("|");
      return colorId === cId && designId === dId;
    }
    if (scope.startsWith("COLOR|"))
      return colorId === scope.slice("COLOR|".length);
    if (scope.startsWith("DESIGN|"))
      return designId === scope.slice("DESIGN|".length);
    return scope === colorId || scope === designId;
  });
}

/** Conjunto de URLs, sin orden ni repetidos, para comparar dos juegos de fotos. */
export function imageUrlKey(urls: string[]): string {
  return Array.from(new Set(urls.map((url) => url.trim())))
    .sort()
    .join("\n");
}
