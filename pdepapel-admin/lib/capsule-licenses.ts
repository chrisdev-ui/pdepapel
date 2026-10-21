/**
 * Productos que parecen de personaje o licencia (marca de terceros). En las
 * ediciones sugeridas quedan fuera hasta que Paula los permita uno por uno
 * («Permitir en cápsulas»). Es una lista de nombres conocidos, no una regla
 * legal: detecta para que una persona decida.
 */
export const LICENSED_TERMS = [
  "hello kitty",
  "sanrio",
  "kuromi",
  "my melody",
  "cinnamoroll",
  "pompompurin",
  "pochacco",
  "keroppi",
  "badtz maru",
  "little twin stars",
  "disney",
  "mickey",
  "minnie",
  "stitch",
  "frozen",
  "toy story",
  "winnie pooh",
  "marvel",
  "spiderman",
  "spider man",
  "avengers",
  "pokemon",
  "pikachu",
  "snoopy",
  "peanuts",
  "barbie",
  "harry potter",
  "hogwarts",
  "tom y jerry",
  "looney tunes",
  "bugs bunny",
  "minions",
  "mario bros",
  "super mario",
  "kirby",
  "sonic",
  "sailor moon",
  "doraemon",
  "totoro",
  "ghibli",
  "naruto",
  "one piece",
  "dragon ball",
  "rilakkuma",
  "pusheen",
  "miffy",
  "bt21",
  "bts",
  "care bears",
  "ositos carinositos",
  "garfield",
  "simpson",
  "simpsons",
  "bluey",
  "paw patrol",
  "peppa",
  "shrek",
  "star wars",
  "batman",
  "superman",
  "wednesday",
  "merlina",
  "squishmallow",
  "labubu",
  "sumikko",
  "san-x",
  "tamagotchi",
  "hatsune miku",
  "my little pony",
] as const;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();

const PATTERNS = LICENSED_TERMS.map((term) => ({ term, pattern: new RegExp(`(^| )${normalize(term).replace(/-/g, "\\-")}( |$)`) }));

/** El primer término conocido en el nombre, diseño, marca o grupo; null si no hay. */
export function detectLicense(texts: readonly (string | null | undefined)[]): string | null {
  const haystack = texts
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .map(normalize)
    .join("  ");
  if (!haystack) return null;
  for (const { term, pattern } of PATTERNS) if (pattern.test(haystack)) return term;
  return null;
}
