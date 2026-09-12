/**
 * Iconos propios de categoría (`Type.iconSvg`), generados con IA en el
 * estilo de Lucide. Se guarda solo el contenido del `<svg>`: una lista de
 * trazos (`path`, `circle`, `line`, `rect`, `polyline`, `polygon`,
 * `ellipse`) con sus atributos geométricos. Nada más pasa: ni scripts, ni
 * estilos, ni enlaces, ni imágenes. El que pinta agrega el envoltorio de
 * Lucide (`fill="none" stroke="currentColor" stroke-width="2" …`).
 *
 * El analizador es de expresiones regulares, sin DOM, para que sirva igual en
 * la API (Node) y en las pruebas. Ante cualquier duda devuelve vacío: un
 * icono que no se pinta es mejor que uno que ejecuta algo.
 *
 * Copia de `pdepapel-admin/lib/svg-icon.ts`: la tienda no puede importar del
 * panel, así que las dos deben mantenerse idénticas.
 */

export const ICON_SVG_MAX_LENGTH = 4000;
export const ICON_SVG_MAX_ELEMENTS = 64;

export const ICON_SVG_ELEMENTS = [
  "path",
  "circle",
  "line",
  "rect",
  "polyline",
  "polygon",
  "ellipse",
] as const;
export type IconSvgElementName = (typeof ICON_SVG_ELEMENTS)[number];

export const ICON_SVG_ATTRIBUTES = [
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
] as const;
export type IconSvgAttributeName = (typeof ICON_SVG_ATTRIBUTES)[number];

/** Atributos de presentación que se descartan sin rechazar el icono: el envoltorio los define. */
const IGNORED_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "opacity",
  "vector-effect",
  "class",
  "id",
  "xmlns",
  "xmlns:xlink",
]);

const REQUIRED_ATTRIBUTES: Record<IconSvgElementName, IconSvgAttributeName[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  line: ["x1", "y1", "x2", "y2"],
  rect: ["width", "height"],
  polyline: ["points"],
  polygon: ["points"],
  ellipse: ["cx", "cy", "rx", "ry"],
};

/** Atributos de la etiqueta `<svg>` con los que Lucide pinta sus iconos. */
export const LUCIDE_SVG_ATTRIBUTES = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ATTRIBUTE_VALUE_PATTERN = /^[0-9a-zA-Z.,\s-]+$/;
const FORBIDDEN_PATTERNS = [
  /<script/i,
  /\bon[a-z]+\s*=/i,
  /href/i,
  /url\(/i,
  /<style/i,
  /<image/i,
  /<foreignObject/i,
  /<!--/,
  /<!\[CDATA\[/i,
  /&#?[a-z0-9]+;/i,
];

export interface IconSvgElement {
  tag: IconSvgElementName;
  attrs: Partial<Record<IconSvgAttributeName, string>>;
}

const isAllowedElement = (name: string): name is IconSvgElementName =>
  (ICON_SVG_ELEMENTS as readonly string[]).includes(name);

const isAllowedAttribute = (name: string): name is IconSvgAttributeName =>
  (ICON_SVG_ATTRIBUTES as readonly string[]).includes(name);

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

/** Extrae el contenido del `<svg>` cuando viene envuelto; si no, usa el texto tal cual. */
function unwrapSvg(markup: string): string | null {
  const trimmed = markup.trim();
  const opening = trimmed.match(/^<svg\b[^>]*>/i);
  if (!opening) {
    // Un texto que menciona <svg> en otra posición no es un icono.
    return /<svg\b/i.test(trimmed) ? null : trimmed;
  }
  const inner = trimmed.slice(opening[0].length);
  const closing = inner.match(/<\/svg\s*>\s*$/i);
  if (!closing || closing.index === undefined) return null;
  return inner.slice(0, closing.index);
}

/** Convierte `a="1" b='2'` en pares; `null` si algo no sigue ese formato. */
function parseAttributes(
  raw: string,
): Partial<Record<IconSvgAttributeName, string>> | null {
  const attrs: Partial<Record<IconSvgAttributeName, string>> = {};
  const pattern = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let consumed = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    consumed += match[0];
    const name = match[1].toLowerCase();
    const value = collapseWhitespace(match[2] ?? match[3] ?? "");
    if (IGNORED_ATTRIBUTES.has(name)) continue;
    if (!isAllowedAttribute(name)) return null;
    if (!value || !ATTRIBUTE_VALUE_PATTERN.test(value)) return null;
    attrs[name] = value;
  }
  // Todo lo que no sea un par entre comillas (atributos sin comillas, basura) descarta el icono.
  if (raw.replace(/\s+/g, "").length !== consumed.replace(/\s+/g, "").length) return null;
  return attrs;
}

/**
 * Devuelve los trazos del icono listos para pintar con React, o `[]` cuando
 * el marcado está vacío, es demasiado largo o contiene algo fuera de la lista
 * permitida.
 */
export function parseIconSvgElements(
  markup: string | null | undefined,
): IconSvgElement[] {
  if (typeof markup !== "string") return [];
  if (markup.length === 0 || markup.length > ICON_SVG_MAX_LENGTH) return [];
  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(markup))) return [];

  const inner = unwrapSvg(markup);
  if (inner === null) return [];

  const elements: IconSvgElement[] = [];
  const open: IconSvgElementName[] = [];
  let index = 0;

  while (index < inner.length) {
    const char = inner[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char !== "<") return [];

    const closing = /^<\/\s*([a-zA-Z]+)\s*>/.exec(inner.slice(index));
    if (closing) {
      const name = closing[1].toLowerCase();
      if (open.pop() !== name) return [];
      index += closing[0].length;
      continue;
    }

    const opening = /^<\s*([a-zA-Z]+)((?:\s+[^<>]*?)?)\s*(\/?)>/.exec(inner.slice(index));
    if (!opening) return [];
    const name = opening[1].toLowerCase();
    if (!isAllowedElement(name)) return [];

    const attrs = parseAttributes(opening[2] ?? "");
    if (!attrs) return [];
    if (REQUIRED_ATTRIBUTES[name].some((required) => !attrs[required])) return [];

    elements.push({ tag: name, attrs });
    if (elements.length > ICON_SVG_MAX_ELEMENTS) return [];
    if (!opening[3]) open.push(name);
    index += opening[0].length;
  }

  if (open.length > 0) return [];
  return elements;
}

/** Serializa los trazos de vuelta a marcado canónico (sin `<svg>`, sin atributos de presentación). */
export function serializeIconSvgElements(elements: IconSvgElement[]): string {
  return elements
    .map((element) => {
      const attrs = ICON_SVG_ATTRIBUTES.filter((name) => element.attrs[name] !== undefined)
        .map((name) => `${name}="${element.attrs[name]}"`)
        .join(" ");
      return `<${element.tag} ${attrs}/>`;
    })
    .join("");
}

/**
 * Marcado saneado para guardar en `Type.iconSvg`, o `null` si no queda ningún
 * trazo válido. Solo salen los elementos y atributos permitidos.
 */
export function sanitizeIconSvg(markup: string | null | undefined): string | null {
  const elements = parseIconSvgElements(markup);
  if (elements.length === 0) return null;
  const serialized = serializeIconSvgElements(elements);
  return serialized.length <= ICON_SVG_MAX_LENGTH ? serialized : null;
}

export function isSafeIconSvg(markup: string | null | undefined): boolean {
  return sanitizeIconSvg(markup) !== null;
}
