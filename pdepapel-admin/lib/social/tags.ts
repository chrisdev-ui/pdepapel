import type { SocialPlatform, SocialTagKind } from "@prisma/client";

/**
 * Etiquetas de «Qué funciona». Formato y Gancho las pone la dueña (con estos
 * valores de fábrica y los que agregue); Tipo, Duración, Día y Franja se
 * calculan al leer y nunca se guardan.
 */
export const DEFAULT_SOCIAL_TAGS: Record<SocialTagKind, readonly string[]> = {
  FORMATO: ["pedido con nombre", "ASMR", "kit", "checklist/lista", "carrusel de producto", "tendencia", "restock"],
  GANCHO: ["pregunta", "producto en mano", "texto grande", "antes/después", "POV"],
};

export const SOCIAL_TAG_KINDS = ["FORMATO", "GANCHO"] as const satisfies readonly SocialTagKind[];
export const SOCIAL_TAG_MAX_LENGTH = 60;
export const SOCIAL_TAGS_PER_KIND_MAX = 10;

export type PostTags = Record<SocialTagKind, string[]>;

/** Sin espacios de más; null si queda vacía o pasa de 60 caracteres. */
export function cleanTagLabel(raw: string): string | null {
  const label = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return label && label.length <= SOCIAL_TAG_MAX_LENGTH ? label : null;
}

/**
 * La misma llave con que MySQL compara (utf8mb4_unicode_ci): sin mayúsculas ni
 * tildes. «POV» y «pov» son una sola etiqueta.
 */
export const tagKey = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Una sola vez cada etiqueta (sin importar mayúsculas ni tildes), en el orden en que llegaron. */
export function uniqueTags(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const label = cleanTagLabel(raw);
    if (!label || seen.has(tagKey(label))) continue;
    seen.add(tagKey(label));
    result.push(label);
  }
  return result;
}

/** Opciones del editor: las de fábrica primero, luego las que agregó la tienda en orden alfabético. */
export function tagOptions(stored: readonly { kind: SocialTagKind; label: string }[]): PostTags {
  const options = {} as PostTags;
  for (const kind of SOCIAL_TAG_KINDS) {
    const defaults = uniqueTags(DEFAULT_SOCIAL_TAGS[kind]);
    const known = new Set(defaults.map(tagKey));
    const custom = uniqueTags(stored.filter((tag) => tag.kind === kind).map((tag) => tag.label))
      .filter((label) => !known.has(tagKey(label)))
      .sort((a, b) => a.localeCompare(b, "es"));
    options[kind] = [...defaults, ...custom];
  }
  return options;
}

export type AutoTagGroup = "TIPO" | "DURACION" | "DIA" | "FRANJA";

export interface AutoTag {
  group: AutoTagGroup;
  label: string;
}

const PRODUCT_TYPE_LABEL: Record<string, string> = { REELS: "Reel", CAROUSEL: "Carrusel", FEED: "Foto", VIDEO: "Video", STORY: "Historia" };

const DURATION_BUCKETS = [
  { below: 15, label: "menos de 15 s" },
  { below: 30, label: "15 a 30 s" },
  { below: 60, label: "30 a 60 s" },
  { below: 120, label: "1 a 2 min" },
  { below: Infinity, label: "más de 2 min" },
] as const;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Franjas de Bogotá: madrugada 0–6, mañana 6–12, mediodía 12–15, tarde 15–19, noche 19–24. */
const HOUR_BANDS = [
  { below: 6, label: "madrugada" },
  { below: 12, label: "mañana" },
  { below: 15, label: "mediodía" },
  { below: 19, label: "tarde" },
  { below: 24, label: "noche" },
] as const;

const BOGOTA_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short", hour: "numeric", hourCycle: "h23" });
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function autoTags(post: { productType: string | null; durationSec: number | null; postedAt: Date }): AutoTag[] {
  const tags: AutoTag[] = [];
  const type = post.productType ? PRODUCT_TYPE_LABEL[post.productType] : undefined;
  if (type) tags.push({ group: "TIPO", label: type });
  if (post.durationSec !== null && post.durationSec > 0) tags.push({ group: "DURACION", label: DURATION_BUCKETS.find((bucket) => post.durationSec! < bucket.below)!.label });
  const parts = Object.fromEntries(BOGOTA_PARTS.formatToParts(post.postedAt).map((part) => [part.type, part.value]));
  tags.push({ group: "DIA", label: WEEKDAYS[WEEKDAY_INDEX[parts.weekday]] });
  const hour = Number(parts.hour);
  tags.push({ group: "FRANJA", label: HOUR_BANDS.find((band) => hour < band.below)!.label });
  return tags;
}

export const NETWORK_NAME: Record<SocialPlatform, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok" };
