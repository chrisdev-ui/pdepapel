/**
 * Copia de las reglas de formulario de `pdepapel-admin/lib/order-risk.ts`
 * (mismos casos de prueba): el servidor rechaza lo mismo, aquí se avisa antes.
 */

export const PHONE_ERROR = "Escribe un celular válido: 10 dígitos que empiezan por 3.";
export const NAME_ERROR = "Revisa tu nombre: escríbelo como en tu documento, sin letras al azar ni números.";

/** Nombre del campo trampa: una persona nunca lo ve ni lo llena. */
export const HONEYPOT_FIELD = "website";

export function normalizeMobile(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+") || raw.startsWith("00");
  const withoutPrefix = raw.startsWith("00") ? digits.slice(2) : digits;
  if (international && !withoutPrefix.startsWith("57")) {
    return withoutPrefix.length >= 8 && withoutPrefix.length <= 15 ? `+${withoutPrefix}` : null;
  }
  const national = withoutPrefix.length === 12 && withoutPrefix.startsWith("57") ? withoutPrefix.slice(2) : withoutPrefix;
  return /^3\d{9}$/.test(national) ? `+57${national}` : null;
}

const VOWELS = /[aeiouyáéíóúüàèìòù]/i;

export function looksLikeRandomName(input: string | null | undefined): boolean {
  const name = String(input ?? "").trim();
  if (!name) return true;
  if (/\d/.test(name)) return true;
  return name.split(/[\s'-]+/).some((word) => {
    if (word.length >= 5 && !VOWELS.test(word)) return true;
    if ((word.match(/[a-záéíóúñü][A-ZÁÉÍÓÚÑÜ]/g) ?? []).length >= 3) return true;
    return /[^aeiouyáéíóúüàèìòù\W\d_]{6,}/i.test(word);
  });
}
