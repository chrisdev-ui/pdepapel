/**
 * De HTML a texto plano, sin sanear. Vive aparte de `lib/rich-text.ts` a
 * propósito: aquello arrastra `sanitize-html` y su analizador (~65 KB gzip en
 * el navegador), y lo único que la tienda necesita del lado del cliente es
 * saber si un HTML ya saneado trae texto o está vacío.
 */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * Las etiquetas de bloque separan palabras; las de línea (strong, em, a,
 * span…) no. Cambiar estas últimas por un espacio publicaba «con caucho ,
 * ideal» cuando el HTML era «con <strong>caucho</strong>, ideal».
 */
const BLOCK_TAG = /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|table|tr|td|th|section|article|header|footer|figure|figcaption|hr)\b[^>]*>|<br\s*\/?>/gi;

export function stripHtmlTags(html?: string | null) {
  if (!html) return "";
  return html
    .replace(BLOCK_TAG, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|quot|#39);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}
