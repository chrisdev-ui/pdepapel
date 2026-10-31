import { brandPhrase } from "@/lib/brand-phrase";

/**
 * Personajes y marcas con licencia que no entran en las tandas de Mercado Libre.
 * Cada patrón se compara por palabra completa, sin tildes ni mayúsculas. Los
 * nombres comunes («kitty», «mario», «pooh», «elsa», «marie») solo cuentan
 * acompañados, para no excluir productos que nada tienen que ver.
 */
export interface LicensedCharacter {
  label: string;
  patterns: string[];
}

export const LICENSED_CHARACTERS: readonly LicensedCharacter[] = [
  { label: "Hello Kitty", patterns: ["hello kitty"] },
  {
    label: "Sanrio",
    patterns: ["sanrio", "my melody", "kuromi", "cinnamoroll", "pompompurin", "keroppi", "pochacco", "badtz maru"],
  },
  { label: "Snoopy", patterns: ["snoopy", "peanuts", "charlie brown", "woodstock"] },
  { label: "El Principito", patterns: ["el principito", "principito", "little prince", "le petit prince"] },
  { label: "Stitch", patterns: ["stitch", "lilo"] },
  {
    label: "Disney",
    patterns: [
      "disney",
      "mickey",
      "minnie",
      "frozen",
      "princesa elsa",
      "elsa y anna",
      "winnie pooh",
      "winnie the pooh",
      "toy story",
      "aristogatos",
      "gata marie",
    ],
  },
  {
    label: "Marvel",
    patterns: ["marvel", "spider man", "hombre arana", "avengers", "vengadores", "iron man", "capitan america", "hulk"],
  },
  { label: "DC", patterns: ["dc comics", "batman", "superman", "wonder woman", "mujer maravilla"] },
  { label: "Harry Potter", patterns: ["harry potter", "hogwarts"] },
  { label: "Pokémon", patterns: ["pokemon", "pikachu"] },
  { label: "Star Wars", patterns: ["star wars"] },
  { label: "Barbie", patterns: ["barbie"] },
  { label: "Kirby", patterns: ["kirby"] },
  { label: "Mario Bros", patterns: ["mario bros", "super mario", "nintendo"] },
  { label: "Studio Ghibli", patterns: ["ghibli", "totoro"] },
  { label: "Ositos Cariñositos", patterns: ["care bears", "ositos carinositos"] },
  { label: "Minions", patterns: ["minions", "minion"] },
  { label: "Bluey", patterns: ["bluey"] },
  { label: "Paw Patrol", patterns: ["paw patrol", "patrulla canina"] },
  { label: "Peppa Pig", patterns: ["peppa"] },
  { label: "Shin-chan", patterns: ["shin chan"] },
  { label: "One Piece", patterns: ["one piece"] },
  { label: "Naruto", patterns: ["naruto"] },
  { label: "Dragon Ball", patterns: ["dragon ball"] },
  { label: "Sailor Moon", patterns: ["sailor moon"] },
  { label: "McDonald's", patterns: ["mcdonald's", "mcdonalds", "mc donalds"] },
  { label: "Coca-Cola", patterns: ["coca cola"] },
  { label: "BT21 / BTS", patterns: ["bt21", "bts"] },
  { label: "Doraemon", patterns: ["doraemon"] },
  { label: "Pusheen", patterns: ["pusheen"] },
];

export const LICENSED_EXCLUSION_REASON = (label: string) =>
  `Personaje con licencia (${label}): excluido de Mercado Libre.`;

const COMPILED = LICENSED_CHARACTERS.flatMap((entry) =>
  entry.patterns.flatMap((pattern) => {
    const phrase = brandPhrase(pattern);
    const variants = phrase.includes(" ") ? [phrase, phrase.replace(/ /g, "")] : [phrase];
    return variants.map((variant) => ({ label: entry.label, matched: pattern, needle: ` ${variant} ` }));
  }),
);

/**
 * Primer personaje con licencia que aparece en el nombre (o en `extra`, otros
 * textos del producto como la marca o el grupo). Gana el que aparece antes en el texto.
 */
export function findLicensedCharacter(
  name: string,
  extra: readonly (string | null | undefined)[] = [],
): { label: string; matched: string } | null {
  for (const text of [name, ...extra]) {
    if (!text) continue;
    const haystack = ` ${brandPhrase(text)} `;
    let best: { label: string; matched: string; at: number } | null = null;
    for (const candidate of COMPILED) {
      const at = haystack.indexOf(candidate.needle);
      if (at >= 0 && (!best || at < best.at)) best = { label: candidate.label, matched: candidate.matched, at };
    }
    if (best) return { label: best.label, matched: best.matched };
  }
  return null;
}
