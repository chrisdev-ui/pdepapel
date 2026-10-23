import type { SocialPlatform } from "@prisma/client";

import { median, MULTIPLIER_MIN_SAMPLE } from "./metrics";
import { NETWORK_NAME, type AutoTag, type AutoTagGroup, type PostTags } from "./tags";

/**
 * «Qué funciona»: por red, cada etiqueta (las de la dueña y las automáticas)
 * con al menos 2 publicaciones, con la mediana de su «× mediana», de % visto y
 * de salto. Con menos de 5 publicaciones la fila dice «pocos datos» y no da
 * titular.
 */
export const WHAT_WORKS_MIN_POSTS = 2;
export const WHAT_WORKS_FEW_DATA_BELOW = MULTIPLIER_MIN_SAMPLE;
/** El titular solo nombra una etiqueta que le gana a la mediana por algo. */
export const WHAT_WORKS_HEADLINE_MIN = 1.1;
export const WHAT_WORKS_TENTATIVE_TEXT = "Todavía es una pista, no una regla: se confirma en unas semanas.";

export type WhatWorksGroup = "FORMATO" | "GANCHO" | AutoTagGroup;

export interface WhatWorksPost {
  platform: SocialPlatform;
  multiplier: number | null;
  multiplierApprox: boolean;
  watchedPct: number | null;
  skipRate: number | null;
  tags: PostTags;
  autoTags: AutoTag[];
}

export interface WhatWorksRow {
  group: WhatWorksGroup;
  label: string;
  count: number;
  fewData: boolean;
  medianMultiplier: number | null;
  approx: boolean;
  medianWatchedPct: number | null;
  medianSkipRate: number | null;
}

export interface WhatWorksNetwork {
  platform: SocialPlatform;
  posts: number;
  rows: WhatWorksRow[];
  headline: string | null;
  /**
   * El titular sale de valores «aprox.» (todavía sin lecturas reales de 7 días):
   * va con «Todavía es una pista, no una regla». Se apaga solo cuando la fila
   * del titular ya no tiene publicaciones aproximadas.
   */
  headlineTentative: boolean;
}

const oneDecimal = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const TYPE_PHRASE: Record<string, string> = { Reel: "los reels", Carrusel: "los carruseles", Foto: "las fotos", Video: "los videos", Historia: "las historias" };
const BAND_PHRASE: Record<string, string> = { madrugada: "de madrugada", mañana: "en la mañana", mediodía: "al mediodía", tarde: "en la tarde", noche: "en la noche" };

/** Sujeto y verbo del titular, en palabras de Paula. */
function phrase(row: Pick<WhatWorksRow, "group" | "label">): { subject: string; verb: string } {
  switch (row.group) {
    case "TIPO":
      return { subject: TYPE_PHRASE[row.label] ?? `las publicaciones «${row.label}»`, verb: "van" };
    case "DURACION":
      return { subject: `los videos de ${row.label}`, verb: "van" };
    case "DIA":
      return { subject: `lo publicado el ${row.label}`, verb: "va" };
    case "FRANJA":
      return { subject: `lo publicado ${BAND_PHRASE[row.label] ?? row.label}`, verb: "va" };
    default:
      return { subject: `las publicaciones «${row.label}»`, verb: "van" };
  }
}

export function whatWorksHeadline(platform: SocialPlatform, row: WhatWorksRow) {
  const { subject, verb } = phrase(row);
  return `En ${NETWORK_NAME[platform]} ${subject} ${verb} ${DECIMAL.format(row.medianMultiplier ?? 0)}× la mediana${row.approx ? " (aprox.)" : ""}.`;
}

function groupsOf(post: WhatWorksPost): { group: WhatWorksGroup; label: string }[] {
  return [
    ...post.tags.FORMATO.map((label) => ({ group: "FORMATO" as const, label })),
    ...post.tags.GANCHO.map((label) => ({ group: "GANCHO" as const, label })),
    ...post.autoTags,
  ];
}

export function whatWorks(posts: readonly WhatWorksPost[]): WhatWorksNetwork[] {
  const networks: WhatWorksNetwork[] = [];
  for (const platform of Array.from(new Set(posts.map((post) => post.platform))).sort()) {
    const own = posts.filter((post) => post.platform === platform);
    const buckets = new Map<string, { group: WhatWorksGroup; label: string; posts: WhatWorksPost[] }>();
    for (const post of own) {
      for (const { group, label } of groupsOf(post)) {
        const key = `${group}:${label}`;
        const bucket = buckets.get(key) ?? { group, label, posts: [] };
        bucket.posts.push(post);
        buckets.set(key, bucket);
      }
    }
    const rows: WhatWorksRow[] = Array.from(buckets.values())
      .filter((bucket) => bucket.posts.length >= WHAT_WORKS_MIN_POSTS)
      .map((bucket) => {
        const measured = bucket.posts.filter((post) => post.multiplier !== null);
        return {
          group: bucket.group,
          label: bucket.label,
          count: bucket.posts.length,
          fewData: bucket.posts.length < WHAT_WORKS_FEW_DATA_BELOW,
          medianMultiplier: oneDecimal(median(measured.map((post) => post.multiplier!))),
          approx: measured.some((post) => post.multiplierApprox),
          medianWatchedPct: oneDecimal(median(bucket.posts.flatMap((post) => (post.watchedPct === null ? [] : [post.watchedPct])))),
          medianSkipRate: oneDecimal(median(bucket.posts.flatMap((post) => (post.skipRate === null ? [] : [post.skipRate])))),
        };
      })
      .sort((a, b) => (b.medianMultiplier ?? -1) - (a.medianMultiplier ?? -1) || b.count - a.count || a.label.localeCompare(b.label, "es"));
    const best = rows.find((row) => !row.fewData && row.medianMultiplier !== null && row.medianMultiplier >= WHAT_WORKS_HEADLINE_MIN);
    networks.push({ platform, posts: own.length, rows, headline: best ? whatWorksHeadline(platform, best) : null, headlineTentative: best?.approx ?? false });
  }
  return networks;
}
