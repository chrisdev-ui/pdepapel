// Marcas de sesión del carrito: si hubo un «agregar» en esta visita, la franja
// de recordatorio no se muestra.
export const CART_TOUCHED_KEY = "pdp_cart_touched";
export const CART_REMINDER_DISMISSED_KEY = "pdp_cart_reminder_dismissed";

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
