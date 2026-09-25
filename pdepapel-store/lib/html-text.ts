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

export function stripHtmlTags(html?: string | null) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|h[2-4]|li|blockquote|pre)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|quot|#39);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}
