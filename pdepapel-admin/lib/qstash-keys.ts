/**
 * QStash solo acepta letras, números, guion, guion bajo y punto en
 * `flowControl.key` (y lo mismo en `deduplicationId`); con cualquier otro
 * carácter rechaza la publicación entera («flowControlKey must be
 * alphanumeric, hyphen, underscore, or period»). El 2026-10-27 un «:» en la
 * fila de comandos dejó un evento sin encolar. Toda llave pasa por aquí.
 */
export const QSTASH_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

export const isValidQStashKey = (key: string) => QSTASH_KEY_PATTERN.test(key);

/**
 * Une las partes con «-» y cambia por «_» lo que QStash no acepta. Las
 * entradas de hoy (teléfonos, BSUID `CO.123…`, uuid, cuid) ya son válidas y
 * salen iguales; una que no lo sea se publica igual en vez de perder el
 * mensaje.
 */
export function qstashKey(...parts: Array<string | number>): string {
  const key = parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("-")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  return key || "unknown";
}
