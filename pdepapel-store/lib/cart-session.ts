// Marcas de sesión del carrito: si hubo un «agregar» en esta visita, la franja
// de recordatorio no se muestra.
export const CART_TOUCHED_KEY = "pdp_cart_touched";
export const CART_REMINDER_DISMISSED_KEY = "pdp_cart_reminder_dismissed";
/** La franja ya se contó como vista en esta visita. */
export const CART_REMINDER_VIEWED_KEY = "pdp_cart_reminder_viewed";

export function readSessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sin sessionStorage no hay recordatorio, nada más
  }
}

export function markCartTouched() {
  writeSessionFlag(CART_TOUCHED_KEY);
}
