import "server-only";

import { sanitizeRichTextHtml } from "@/lib/rich-text";

/**
 * Deja la descripción de un producto lista para pintarse tal cual.
 *
 * Es la única puerta por la que una descripción llega al navegador: la página
 * de producto la cruza al renderizar y `/api/producto/[slug]` al cambiar de
 * variante. Del otro lado, `RichTextDisplay` confía en lo que recibe y no
 * vuelve a sanear —así `sanitize-html` se queda en el servidor—. Por eso este
 * módulo es `server-only`: importarlo desde un componente de cliente rompe la
 * compilación en vez de volver a meter el saneador en el paquete.
 *
 * El administrador ya sanea al guardar; esto es la segunda cerradura, la de
 * siempre, solo que ahora del lado que no le cuesta bytes a nadie.
 */
export function withSanitizedDescription<T extends { description?: string | null }>(
  product: T,
): T {
  return { ...product, description: sanitizeRichTextHtml(product.description) };
}
