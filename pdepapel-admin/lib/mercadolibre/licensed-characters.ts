import { brandPhrase } from "@/lib/brand-phrase";

/**
 * Personajes y marcas con licencia que no entran en las tandas de Mercado Libre.
 * Cada patrón se compara por palabra completa, sin tildes ni mayúsculas.
 *
 * Dos niveles (decisión de Christian, 2026-10-31):
 *   * «excluido»: licencia clara. Nunca entra en una tanda.
 *   * «por revisar»: una palabra que a veces es licencia y a veces no
 *     («sirenita», «Ariel», «Elsa»…). Queda fuera hasta que Christian lo apruebe
 *     producto por producto (`Product.mercadoLibreLicenseApprovedAt`).
 * Las palabras comunes solas («hello», «araña», «princesa», «mario») no cuentan:
 * «princesa» solo con Disney o con el nombre de una princesa.
 */
export type LicensedTier = "excluded" | "review";

export interface LicensedCharacter {
  label: string;
  patterns: string[];
  tier: LicensedTier;
}

const NAMED_PRINCESSES = ["ariel", "elsa", "anna", "rapunzel", "cenicienta", "bella", "moana", "jasmin", "jazmin", "mulan", "aurora", "blancanieves", "tiana", "mérida", "pocahontas", "sofia"];

export const LICENSED_CHARACTERS: readonly LicensedCharacter[] = [
  { label: "Hello Kitty", tier: "excluded", patterns: ["hello kitty"] },
  {
    label: "Sanrio",
    tier: "excluded",
    patterns: ["sanrio", "my melody", "kuromi", "cinnamoroll", "pompompurin", "keroppi", "pochacco", "badtz maru", "little twin stars", "tuxedosam"],
  },
  { label: "Snoopy", tier: "excluded", patterns: ["snoopy", "peanuts", "charlie brown", "woodstock"] },
  { label: "El Principito", tier: "excluded", patterns: ["el principito", "principito", "little prince", "le petit prince"] },
  { label: "Stitch", tier: "excluded", patterns: ["stitch", "lilo"] },
  {
    label: "Disney",
    tier: "excluded",
    patterns: [
      "disney",
      "mickey",
      "minnie",
      "frozen",
      "elsa y anna",
      "winnie pooh",
      "winnie the pooh",
      "toy story",
      "aristogatos",
      "gata marie",
      "la sirenita",
      "moana",
      ...NAMED_PRINCESSES.flatMap((name) => [`princesa ${name}`, `princesas ${name}`]),
    ],
  },
  {
    label: "Marvel",
    tier: "excluded",
    patterns: ["marvel", "spider man", "hombre arana", "avengers", "vengadores", "iron man", "capitan america", "hulk"],
  },
  { label: "DC", tier: "excluded", patterns: ["dc comics", "batman", "superman", "wonder woman", "mujer maravilla"] },
  { label: "Harry Potter", tier: "excluded", patterns: ["harry potter", "hogwarts", "hogwart", "gryffindor", "slytherin", "ravenclaw", "hufflepuff"] },
  { label: "Pokémon", tier: "excluded", patterns: ["pokemon", "pikachu"] },
  { label: "Star Wars", tier: "excluded", patterns: ["star wars"] },
  { label: "Barbie", tier: "excluded", patterns: ["barbie"] },
  { label: "Kirby", tier: "excluded", patterns: ["kirby"] },
  { label: "Mario Bros", tier: "excluded", patterns: ["mario bros", "super mario", "nintendo"] },
  { label: "Studio Ghibli", tier: "excluded", patterns: ["ghibli", "totoro"] },
  { label: "Ositos Cariñositos", tier: "excluded", patterns: ["care bears", "ositos carinositos"] },
  { label: "Minions", tier: "excluded", patterns: ["minions", "minion"] },
  { label: "Bluey", tier: "excluded", patterns: ["bluey"] },
  { label: "Paw Patrol", tier: "excluded", patterns: ["paw patrol", "patrulla canina"] },
  { label: "Peppa Pig", tier: "excluded", patterns: ["peppa"] },
  { label: "Shin-chan", tier: "excluded", patterns: ["shin chan"] },
  { label: "One Piece", tier: "excluded", patterns: ["one piece", "luffy"] },
  { label: "Naruto", tier: "excluded", patterns: ["naruto"] },
  { label: "Dragon Ball", tier: "excluded", patterns: ["dragon ball"] },
  { label: "Sailor Moon", tier: "excluded", patterns: ["sailor moon"] },
  { label: "McDonald's", tier: "excluded", patterns: ["mcdonald's", "mcdonalds", "mc donalds"] },
  { label: "Coca-Cola", tier: "excluded", patterns: ["coca cola"] },
  { label: "BT21 / BTS", tier: "excluded", patterns: ["bt21", "bts"] },
  { label: "Doraemon", tier: "excluded", patterns: ["doraemon"] },
  { label: "Pusheen", tier: "excluded", patterns: ["pusheen"] },
  // Los mismos nombres que ya vigila `lib/capsule-licenses.ts` y faltaban aquí.
  { label: "Warner Bros", tier: "excluded", patterns: ["tom y jerry", "looney tunes", "bugs bunny"] },
  { label: "Sonic", tier: "excluded", patterns: ["sonic"] },
  { label: "San-X", tier: "excluded", patterns: ["san x", "rilakkuma", "sumikko"] },
  { label: "Miffy", tier: "excluded", patterns: ["miffy"] },
  { label: "Garfield", tier: "excluded", patterns: ["garfield"] },
  { label: "Los Simpson", tier: "excluded", patterns: ["simpson", "simpsons"] },
  { label: "Shrek", tier: "excluded", patterns: ["shrek"] },
  { label: "Merlina", tier: "excluded", patterns: ["merlina"] },
  { label: "Squishmallows", tier: "excluded", patterns: ["squishmallow", "squishmallows"] },
  { label: "Labubu", tier: "excluded", patterns: ["labubu"] },
  { label: "Tamagotchi", tier: "excluded", patterns: ["tamagotchi"] },
  { label: "Hatsune Miku", tier: "excluded", patterns: ["hatsune miku"] },
  { label: "My Little Pony", tier: "excluded", patterns: ["my little pony"] },
  {
    label: "Disney (por revisar)",
    tier: "review",
    patterns: ["sirenita", "ariel", "elsa", "rapunzel", "cenicienta", "princesas disney", "pooh"],
  },
  { label: "Hello Kitty (por revisar)", tier: "review", patterns: ["kitty"] },
  { label: "Merlina (por revisar)", tier: "review", patterns: ["wednesday"] },
];

export const LICENSED_EXCLUSION_REASON = (label: string) =>
  `Personaje con licencia (${label}): excluido de Mercado Libre.`;

export const LICENSED_REVIEW_REASON = (label: string, matched: string) =>
  `Posible personaje con licencia (${label.replace(/ \(por revisar\)$/, "")}, «${matched}»): por revisar. No entra en las tandas hasta que lo apruebes.`;

const COMPILED = LICENSED_CHARACTERS.flatMap((entry) =>
  entry.patterns.flatMap((pattern) => {
    const phrase = brandPhrase(pattern);
    const variants = phrase.includes(" ") ? [phrase, phrase.replace(/ /g, "")] : [phrase];
    return variants.map((variant) => ({ label: entry.label, tier: entry.tier, matched: pattern, needle: ` ${variant} ` }));
  }),
);

export interface LicensedMatch {
  label: string;
  matched: string;
  tier: LicensedTier;
}

function firstMatch(texts: readonly (string | null | undefined)[], tier: LicensedTier): LicensedMatch | null {
  for (const text of texts) {
    if (!text) continue;
    const haystack = ` ${brandPhrase(text)} `;
    let best: (LicensedMatch & { at: number }) | null = null;
    for (const candidate of COMPILED) {
      if (candidate.tier !== tier) continue;
      const at = haystack.indexOf(candidate.needle);
      if (at >= 0 && (!best || at < best.at)) best = { label: candidate.label, matched: candidate.matched, tier, at };
    }
    if (best) return { label: best.label, matched: best.matched, tier: best.tier };
  }
  return null;
}

/**
 * Personaje con licencia en el nombre (o en `extra`, otros textos del producto
 * como la marca o el grupo). Un «excluido» en cualquier texto gana sobre un
 * «por revisar»; dentro del nivel gana el texto que va antes y, en él, el
 * personaje que aparece primero.
 */
export function findLicensedCharacter(name: string, extra: readonly (string | null | undefined)[] = []): LicensedMatch | null {
  const texts = [name, ...extra];
  return firstMatch(texts, "excluded") ?? firstMatch(texts, "review");
}

/** La razón visible de un resultado de `findLicensedCharacter`. */
export const licensedReason = (match: LicensedMatch) =>
  match.tier === "excluded" ? LICENSED_EXCLUSION_REASON(match.label) : LICENSED_REVIEW_REASON(match.label, match.matched);
