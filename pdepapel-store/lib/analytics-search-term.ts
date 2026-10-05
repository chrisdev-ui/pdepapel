/**
 * Término de búsqueda apto para analítica (GA4, Clarity, Vercel Analytics).
 *
 * GA4 prohíbe enviar datos personales: si alguien pega su correo o su
 * teléfono en el buscador, ese texto no puede salir del navegador. También se
 * normaliza para que «Cuaderno » y «cuaderno» cuenten como la misma búsqueda.
 *
 * - minúsculas, espacios colapsados, máximo 100 caracteres;
 * - null si parece un correo o un número de 7 o más dígitos (teléfono,
 *   cédula), separadores incluidos.
 */
export const SEARCH_TERM_MAX_LENGTH = 100;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_NUMBER_PATTERN = /(?:\+?\d[\s().-]*){7,}/;

export function sanitizeSearchTerm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const term = raw.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-CO");
  if (!term) return null;
  if (EMAIL_PATTERN.test(term) || LONG_NUMBER_PATTERN.test(term)) return null;
  return term.slice(0, SEARCH_TERM_MAX_LENGTH).trimEnd();
}
