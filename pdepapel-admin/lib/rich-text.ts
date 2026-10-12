import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "mark",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "sup",
  "sub",
  "a",
  "span",
];

const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgb\((?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?\)|(?:black|white|yellow|pink|purple|blue|green|red|orange))$/i;
const SAFE_TEXT_ALIGNMENT = /^(left|center|right|justify)$/i;
const STYLE_ATTRIBUTE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function sanitizeStyles(styleValue: string) {
  const declarations = styleValue
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex === -1) return [];

      const property = declaration
        .slice(0, separatorIndex)
        .trim()
        .toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (
        (property === "color" || property === "background-color") &&
        SAFE_COLOR.test(value)
      ) {
        return [`${property}: ${value}`];
      }

      if (property === "text-align" && SAFE_TEXT_ALIGNMENT.test(value)) {
        return [`${property}: ${value.toLowerCase()}`];
      }

      return [];
    });

  return declarations.join("; ");
}

export function normalizeRichTextLink(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  if (/^\/(?!\/)/.test(trimmedValue)) return trimmedValue;

  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmedValue)) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createPlainTextRichTextHtml(content: string) {
  const paragraphs = content
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeText(paragraph)}</p>`)
    .join("");

  return sanitizeRichTextHtml(paragraphs);
}

function secureAnchors(html: string) {
  return html.replace(/<a\b[^>]*href="([^"]*)"[^>]*>/gi, (_match, href) => {
    const normalizedHref = normalizeRichTextLink(href);
    if (!normalizedHref) return "<span>";

    const isExternal = /^https?:\/\//i.test(normalizedHref);
    const attributes = [`href="${escapeAttribute(normalizedHref)}"`];

    if (isExternal) {
      attributes.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    return `<a ${attributes.join(" ")}>`;
  });
}

export function sanitizeRichTextHtml(content?: string | null) {
  if (!content) return "";

  const normalizedHeadings = content
    .replace(/<\/?h1\b/gi, (tag) => tag.replace(/h1/i, "h2"))
    .replace(
      STYLE_ATTRIBUTE,
      (_match, doubleQuotedStyle, singleQuotedStyle, unquotedStyle) => {
        const safeStyle = sanitizeStyles(
          doubleQuotedStyle ?? singleQuotedStyle ?? unquotedStyle ?? "",
        );
        return safeStyle ? ` style="${safeStyle}"` : "";
      },
    );

  const sanitized = sanitizeHtml(normalizedHeadings, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "style"],
      span: ["style"],
      mark: ["style"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
      h4: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });

  return secureAnchors(sanitized).trim();
}

const decodeBasicEntities = (text: string) =>
  text.replace(/&(nbsp|amp|quot|#39);/gi, (entity) => {
    const entities: Record<string, string> = {
      "&nbsp;": " ",
      "&amp;": "&",
      "&quot;": '"',
      "&#39;": "'",
    };
    return entities[entity.toLowerCase()] ?? " ";
  });

export function richTextToPlainText(content?: string | null) {
  return decodeBasicEntities(
    sanitizeRichTextHtml(content)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|h[2-4]|li|blockquote|pre)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const FEED_BLOCK_END = /<\/(?:p|h[2-4]|li|blockquote|pre)>|<br\s*\/?>/gi;
// Con `new RegExp`: el literal con la bandera `u` no compila con el target de este proyecto.
const TRAILING_EMOJI = new RegExp("(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D|\\s)+$", "u");

/**
 * Texto de una línea para los feeds de Google y Meta, que no admiten HTML ni
 * saltos de línea. Cada bloque (párrafo, título, viñeta, salto) queda como su
 * propia frase: si no termina en puntuación se le pone punto, para que
 * «Marca: X» y «Cantidad: Y» no se lean pegados.
 */
export function richTextToFeedText(content?: string | null) {
  return sanitizeRichTextHtml(content)
    .split(FEED_BLOCK_END)
    .map((block) => decodeBasicEntities(block.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((block) => (/[.!?:;…]$/.test(block.replace(TRAILING_EMOJI, "")) ? block : `${block}.`))
    .join(" ");
}

export function createRichTextExcerpt(
  content: string | null | undefined,
  fallback: string,
  maxLength = 160,
) {
  const text = richTextToPlainText(content) || fallback;
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength - 1);
  const lastWordBoundary = truncated.lastIndexOf(" ");

  return `${truncated.slice(0, lastWordBoundary > 0 ? lastWordBoundary : maxLength - 1).trimEnd()}…`;
}
