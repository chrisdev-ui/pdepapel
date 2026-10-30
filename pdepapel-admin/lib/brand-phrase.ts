/** Minúsculas, sin tildes y con todo lo que no es letra o número como espacio. */
export const brandPhrase = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
