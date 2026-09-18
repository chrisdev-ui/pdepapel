/**
 * Fotos de la ficha de producto. Puro y testeable.
 *
 * La papelera ya no borra en Cloudinary al instante: marca la foto «se quita
 * al guardar» y el archivo se elimina solo después de que la base de datos
 * confirmó el guardado. Antes, abandonar el formulario dejaba una fila
 * apuntando a un archivo que ya no existía.
 */

export interface ProductFormImage {
  url: string;
  isMain: boolean;
}

/** Exactamente una principal: se respeta la guardada; si no hay, la primera. */
export function normalizeProductImages(
  images: { url: string; isMain?: boolean | null }[],
): ProductFormImage[] {
  const seen = new Set<string>();
  const unique = images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
  const mainIndex = unique.findIndex((image) => image.isMain);
  return unique.map((image, index) => ({
    url: image.url,
    isMain: index === (mainIndex === -1 ? 0 : mainIndex),
  }));
}

/** Las fotos que de verdad se guardan: sin las marcadas, con una principal. */
export function imagesToSave(
  images: ProductFormImage[],
  pendingRemovals: Iterable<string>,
): ProductFormImage[] {
  const removed = new Set(pendingRemovals);
  return normalizeProductImages(images.filter((image) => !removed.has(image.url)));
}

/**
 * Qué archivos limpiar en Cloudinary después de guardar. Los que ya estaban
 * en la base los borra el servidor al guardar; los subidos en esta sesión y
 * descartados antes de guardar no existen en la base, así que los borra el
 * navegador con `cleanupImages`.
 */
export function unsavedUploadsToCleanup(
  removedUrls: Iterable<string>,
  storedUrls: Iterable<string>,
): string[] {
  const stored = new Set(storedUrls);
  return Array.from(new Set(removedUrls)).filter((url) => !stored.has(url));
}
