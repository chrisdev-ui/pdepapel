/**
 * «313 258 2293», «+57 313…» o «573132582293» → «573132582293». Solo celulares
 * colombianos (10 dígitos que empiezan por 3); cualquier otra cosa es null.
 */
export function normalizeWhatsappNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
  return /^3\d{9}$/.test(local) ? `57${local}` : null;
}

/** «573132582293» → «313 258 2293», como se lee en pantalla. */
export function formatWhatsappNumber(normalized: string): string {
  const local = normalized.startsWith("57") ? normalized.slice(2) : normalized;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
