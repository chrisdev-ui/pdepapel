import { createHash, randomBytes } from "node:crypto";

/**
 * Códigos de tarjeta de regalo.
 *
 * El código en claro existe solo en el correo que recibe la persona: en la
 * base queda su sha256 y sus últimos cuatro caracteres. Aquí viven la
 * generación, la normalización de lo que la clienta escribe y el hash, para
 * que el checkout, la validación pública y el panel hablen el mismo idioma.
 *
 * Formato `PDP-XXXX-XXXX-XXXX` con el alfabeto de Crockford (sin 0/O ni 1/I/L):
 * doce símbolos de 32 valores ≈ 60 bits al azar, suficientes para que adivinar
 * un código válido sea impracticable incluso sin el límite de intentos, que
 * además existe (lib/rate-limit.ts).
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford sin 0, 1, I, L, O, U
const GROUPS = 3;
const GROUP_LENGTH = 4;
export const GIFT_CARD_CODE_PREFIX = "PDP";
export const GIFT_CARD_CODE_LENGTH = GROUPS * GROUP_LENGTH;

/** Genera un código nuevo, ya formateado. */
export function generateGiftCardCode(): string {
  const bytes = randomBytes(GIFT_CARD_CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < GIFT_CARD_CODE_LENGTH; i += 1) {
    raw += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return formatGiftCardCode(raw);
}

/** `ABCDEFGHJKMN` → `PDP-ABCD-EFGH-JKMN`. */
export function formatGiftCardCode(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_LENGTH) {
    groups.push(raw.slice(i, i + GROUP_LENGTH));
  }
  return [GIFT_CARD_CODE_PREFIX, ...groups].join("-");
}

/**
 * Lo que escribió la clienta, a la forma canónica: mayúsculas, sin espacios
 * ni guiones, sin el prefijo, y con las confusiones de lectura corregidas
 * (O→0 no aplica: el alfabeto no tiene 0; se corrige O→Q? no: se rechaza).
 * Devuelve `null` si no puede ser un código.
 */
export function normalizeGiftCardCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let value = input.toUpperCase().replace(/[\s-]/g, "");
  if (value.startsWith(GIFT_CARD_CODE_PREFIX)) value = value.slice(GIFT_CARD_CODE_PREFIX.length);
  if (value.length !== GIFT_CARD_CODE_LENGTH) return null;
  for (const char of value) {
    if (!ALPHABET.includes(char)) return null;
  }
  return value;
}

/** sha256 del código canónico (sin prefijo ni guiones), en hexadecimal. */
export function hashGiftCardCode(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Los últimos cuatro caracteres, lo único del código que ve el panel. */
export function giftCardCodeLast4(canonical: string): string {
  return canonical.slice(-4);
}

/**
 * Lo que la clienta escribe → `{ hash, last4 }` o `null` si no es un código.
 * Es la única entrada que usan la validación pública y el checkout.
 */
export function parseGiftCardCode(input: string | null | undefined) {
  const canonical = normalizeGiftCardCode(input);
  if (!canonical) return null;
  return { hash: hashGiftCardCode(canonical), last4: giftCardCodeLast4(canonical) };
}
