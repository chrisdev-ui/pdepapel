import { DESCRIPTION_MARKERS } from "@/lib/copiloto/skills/descripciones";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

/**
 * «Copiar para la ficha»: del texto del chat (líneas, viñetas y **negritas**)
 * al HTML de la plantilla, el mismo que guarda el editor de productos:
 * gancho y títulos de sección en <h3>, viñetas en <ul><li>, lo demás en <p>.
 * Pasa por el mismo sanitizador que el editor.
 */
export function extractDescriptionBlock(text: string): string | null {
  const start = text.indexOf(DESCRIPTION_MARKERS.description);
  if (start < 0) return null;
  const from = start + DESCRIPTION_MARKERS.description.length;
  const ends = [DESCRIPTION_MARKERS.seo, DESCRIPTION_MARKERS.missing]
    .map((marker) => text.indexOf(marker, from))
    .filter((index) => index >= 0);
  const block = text.slice(from, ends.length ? Math.min(...ends) : undefined).trim();
  return block || null;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (value: string) => escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const BULLET = /^[-•*]\s+/;
const WHOLE_BOLD = /^\*\*([^*]+)\*\*$/;

export function descriptionBlockToHtml(block: string): string {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const html: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) html.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  lines.forEach((line, index) => {
    if (BULLET.test(line)) {
      list.push(`<li>${inline(line.replace(BULLET, ""))}</li>`);
      return;
    }
    flush();
    const heading = WHOLE_BOLD.exec(line);
    if (heading) html.push(`<h3>${inline(heading[1])}</h3>`);
    else if (index === 0) html.push(`<h3>${inline(line)}</h3>`);
    else html.push(`<p>${inline(line)}</p>`);
  });
  flush();
  return sanitizeRichTextHtml(html.join(""));
}

export function descriptionBlockToPlainText(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim().replace(/\*\*([^*]+)\*\*/g, "$1").replace(BULLET, "• "))
    .filter(Boolean)
    .join("\n");
}
