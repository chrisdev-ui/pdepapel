// Acceso anticipado a productos «Próximamente»: el enlace del correo deja una
// cookie con el token firmado por el panel; el checkout la reenvía.

export const EARLY_ACCESS_COOKIE = "pdp_early_access";

export function readEarlyAccessCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${EARLY_ACCESS_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
