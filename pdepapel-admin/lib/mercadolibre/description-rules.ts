export type DescriptionIssueKind = "url" | "email" | "phone" | "handle" | "contact-phrase" | "html" | "emoji";

export interface DescriptionIssue {
  kind: DescriptionIssueKind;
  sample: string;
}

export interface DescriptionInspection {
  clean: string;
  issues: DescriptionIssue[];
}

export const DESCRIPTION_ISSUE_LABEL: Record<DescriptionIssueKind, string> = {
  url: "enlaces",
  email: "correos",
  phone: "teléfonos",
  handle: "usuarios de redes",
  "contact-phrase": "datos de contacto",
  html: "código HTML",
  emoji: "emojis",
};

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  times: "×",
  iexcl: "¡",
  iquest: "¿",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  uuml: "ü",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Uuml: "Ü",
  Ntilde: "Ñ",
};

const ENTITY = /&(?:([a-zA-Z]+)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g;
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?-->/g;
const BLOCK_TAG = /^<\/?(?:br|p|div|li|ul|ol|h[1-6]|tr|table)\b/i;

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;
const TLDS = "com|co|net|org|me|ly|shop|store|tienda|io|app|link|info|biz|online|site|page|gl|to";
const URL_PATTERN = new RegExp(
  String.raw`(?:https?:\/\/|www\.)[^\s<>"«»]+` +
    String.raw`|(?<![\w@.-])(?:[a-zA-Z0-9-]+\.)+(?:${TLDS})(?:\.[a-zA-Z]{2})?(?![\w-])(?:\/[^\s<>"«»]*)?`,
  "gi",
);
const URL_TRAILING = /[.,;:!?)\]»]+$/;
const HANDLE = /(?<![\w.@])@[a-zA-Z0-9_](?:[a-zA-Z0-9_.]{0,28}[a-zA-Z0-9_])?/g;
// Celulares (3xx) y fijos con indicativo 60x; los separadores son espacio, guion o punto.
const PHONE =
  /(?<![\w.,+])(?:\+?\s?57[\s.-]?)?(?:\(\s*60\d\s*\)\s?[\s.-]?\d{3}[\s.-]?\d{4}|60\d[\s.-]?\d{3}[\s.-]?\d{4}|\(?3\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?![\w]|[.,]\d)/g;
const CONTACT_PHRASE = new RegExp(
  String.raw`escr[ií]benos|ll[aá]manos|cont[aá]ctanos|whats\s?app|s[ií]guenos|instagram|facebook|tiktok|telegram|visita\s+nuestra\s+tienda|vis[ií]tanos`,
  "iu",
);
const EMOJI = new RegExp(
  String.raw`(?:(?![©®™])\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}‍︎️⃣])+`,
  "gu",
);

// Marca de hueco: lo removido se reemplaza por ella y al final se decide si queda espacio o nada.
const GAP = "\u0000";

function decodeEntities(text: string, issues: DescriptionIssue[]): string {
  let current = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = current.replace(ENTITY, (match, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
      let decoded: string | undefined;
      if (name !== undefined) decoded = NAMED_ENTITIES[name];
      else {
        const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
        if (code > 0 && code <= 0x10ffff) decoded = String.fromCodePoint(code);
      }
      if (decoded === undefined) return match;
      issues.push({ kind: "html", sample: match });
      return decoded;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

function stripTags(text: string, issues: DescriptionIssue[]): string {
  return text.replace(TAG, (match) => {
    issues.push({ kind: "html", sample: match.length > 40 ? `${match.slice(0, 40)}…` : match });
    return BLOCK_TAG.test(match) ? "\n" : GAP;
  });
}

function dropContactSentences(text: string, issues: DescriptionIssue[]): string {
  return text
    .split("\n")
    .map((line) => {
      if (!CONTACT_PHRASE.test(line)) return line;
      const sentences = line.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((sentence) => {
        const hit = sentence.match(CONTACT_PHRASE);
        if (!hit) return true;
        issues.push({ kind: "contact-phrase", sample: hit[0] });
        return false;
      });
      return kept.length > 0 ? kept.join(" ") + GAP : GAP;
    })
    .join("\n");
}

function removeMatches(text: string, pattern: RegExp, kind: DescriptionIssueKind, issues: DescriptionIssue[]): string {
  return text.replace(pattern, (match) => {
    if (kind === "url") {
      const trailing = match.match(URL_TRAILING)?.[0] ?? "";
      const url = trailing ? match.slice(0, -trailing.length) : match;
      issues.push({ kind, sample: url });
      return GAP + trailing;
    }
    issues.push({ kind, sample: match.trim() });
    return GAP;
  });
}

function closeGaps(text: string): string {
  const lines = text.split("\n").map((line) => {
    if (!line.includes(GAP)) return line.replace(/[ \t]+$/, "");
    let result = line.replace(/[ \t]*\u0000[\u0000 \t]*/g, (match, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);
      if (before.trim() === "" || after === "" || /^[.,;:!?)\]»]/.test(after)) return "";
      return " ";
    });
    result = result.replace(/[ \t]+$/, "");
    // Una línea que solo conserva viñetas o puntuación tras quitar el contacto no aporta nada.
    if (/^[\s\-–—•*·:|.,;()]*$/.test(result)) return "";
    return result;
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

function dedupe(issues: DescriptionIssue[]): DescriptionIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}\u0001${issue.sample}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Mercado Libre rechaza o castiga descripciones con enlaces, datos de contacto,
 * HTML o emojis. Devuelve el texto limpio y lo que se quitó.
 */
export function inspectMercadoLibreDescription(text: string): DescriptionInspection {
  const issues: DescriptionIssue[] = [];
  let clean = text.replace(/\r\n?/g, "\n").split(GAP).join("");
  clean = decodeEntities(clean, issues);
  clean = stripTags(clean, issues);
  clean = dropContactSentences(clean, issues);
  clean = removeMatches(clean, EMAIL, "email", issues);
  clean = removeMatches(clean, URL_PATTERN, "url", issues);
  clean = removeMatches(clean, HANDLE, "handle", issues);
  clean = removeMatches(clean, PHONE, "phone", issues);
  clean = removeMatches(clean, EMOJI, "emoji", issues);
  clean = closeGaps(clean);
  return { clean, issues: dedupe(issues) };
}
