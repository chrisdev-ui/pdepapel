import type { SocialPlatform } from "@prisma/client";

import { tagKey } from "./tags";

/**
 * La misma pieza en varias redes. Solo se **sugiere**, nunca se une sola:
 * otra red, publicadas con 48 h o menos de diferencia y textos parecidos
 * (Jaccard ≥ 0,6 sobre palabras sin tildes, hashtags, menciones, enlaces ni
 * palabras vacías). Una pieza lleva una publicación por red como máximo.
 */
export const PIECE_MAX_HOURS_APART = 48;
export const PIECE_MIN_JACCARD = 0.6;

/** Palabras que no dicen de qué trata la publicación. Lista propia: la del buscador trae frases de WhatsApp. */
const STOPWORDS = new Set(
  "a al algo ante asi aqui como con cual cuando de del desde donde el ella en entre era es esa ese eso esta este esto estos estas fue ha hay la las le les lo los mas me mi mis muy ni no nos o otra otro para pero por porque que se si sin sobre son su sus tan te tu tus un una uno unos unas y ya yo ve ven aca link bio".split(" "),
);

export function captionWords(caption: string | null): Set<string> {
  const text = tagKey(caption ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/[#@][a-z0-9ñ_.]+/g, " ");
  return new Set(
    text
      .split(/[^a-z0-9ñ]+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((word) => {
    if (b.has(word)) shared += 1;
  });
  return shared / (a.size + b.size - shared);
}

export interface PieceCandidate {
  id: string;
  platform: SocialPlatform;
  postedAt: Date;
  caption: string | null;
  pieceId: string | null;
}

/** Para cada publicación sin pieza, las de otra red (también sin pieza) que parecen la misma, de la más parecida a la menos. */
export function pieceSuggestions(posts: readonly PieceCandidate[]): Map<string, string[]> {
  const loose = posts.filter((post) => post.pieceId === null).map((post) => ({ ...post, words: captionWords(post.caption) }));
  const result = new Map<string, string[]>();
  for (const post of loose) {
    const matches = loose
      .filter((other) => other.platform !== post.platform && Math.abs(other.postedAt.getTime() - post.postedAt.getTime()) <= PIECE_MAX_HOURS_APART * 3_600_000)
      .map((other) => ({ id: other.id, score: jaccard(post.words, other.words) }))
      .filter((match) => match.score >= PIECE_MIN_JACCARD)
      .sort((a, b) => b.score - a.score);
    if (matches.length) result.set(post.id, matches.map((match) => match.id));
  }
  return result;
}
