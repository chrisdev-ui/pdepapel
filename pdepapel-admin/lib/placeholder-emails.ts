/**
 * Correos de relleno: los que se ponen en una venta de mostrador o en un
 * pedido manual cuando la clienta no dio el suyo. No son de nadie, así que
 * los correos para la clienta (pedido, envío, regalo, guardar en la cuenta)
 * no salen hacia ellos; el aviso al admin sí.
 *
 * Antes salían y Resend los devolvía rebotados (ORD-…-716, …-479, …-356,
 * …-976 en la semana del 2026-10-07).
 *
 * Es otra lista que la de lib/customer-views.ts: esa también marca como no
 * clientes las direcciones de la tienda, que sí reciben correo.
 */
export const PLACEHOLDER_CUSTOMER_EMAILS: readonly string[] = ["clientesvarios@gmail.com"];

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PLACEHOLDER_CUSTOMER_EMAILS.includes(email.trim().toLowerCase());
}
