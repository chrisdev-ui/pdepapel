export interface ImageMappingEntry {
  url: string;
  scope: string;
}

interface ResolveVariantImagesOptions {
  /** Imágenes puestas a mano en la variante: mandan sobre el reparto. */
  variantImages?: (string | { url: string; isMain?: boolean })[] | null;
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
    // `isMain` viaja: es cuál es la portada de esa variante. Antes se perdía
    // aquí —se devolvía solo la url— y como la rama del grupo sí la lleva, el
    // resultado era que toda variante con fotos propias se quedaba sin
    // portada en cada guardado del grupo, fuera cual fuera el motivo. Luego
    // cada pantalla adivinaba una distinta y la portada «cambiaba sola».
    return variantImages.map((image) =>
      typeof image === "string"
        ? { url: image }
        : { url: image.url, isMain: image.isMain },
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

/**
 * Garantiza que una variante tenga exactamente una portada.
 *
 * Si ninguna de sus fotos viene marcada, se asciende la primera. Es la red
 * que faltaba: el formulario del producto suelto ya obliga a tener una y
 * solo una portada —su esquema de Zod lo exige—, pero el camino del grupo no
 * tenía nada equivalente, así que una variante podía quedar guardada sin
 * ninguna. Sin portada, cada pantalla elegía por su cuenta (unas por
 * `orderBy isMain desc` con desempate arbitrario, la ficha del producto por
 * el primero del arreglo) y la portada parecía cambiar sola.
 *
 * No toca nada si ya hay una marcada, y devuelve el mismo arreglo vacío si
 * la variante no tiene fotos.
 */
export function withVariantCover<T extends { url: string; isMain?: boolean }>(
  images: T[],
): (T & { isMain: boolean })[] {
  const normalizadas = images.map((image) => ({ ...image, isMain: image.isMain ?? false }));
  if (normalizadas.length === 0) return normalizadas;
  if (normalizadas.some((image) => image.isMain)) return normalizadas;
  normalizadas[0] = { ...normalizadas[0], isMain: true };
  return normalizadas;
}

/** Conjunto de URLs, sin orden ni repetidos, para comparar dos juegos de fotos. */
export function imageUrlKey(urls: string[]): string {
  return Array.from(new Set(urls.map((url) => url.trim())))
    .sort()
    .join("\n");
}
