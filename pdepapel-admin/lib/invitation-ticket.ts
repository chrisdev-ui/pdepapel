/**
 * El billete (`__clerk_ticket`) de una invitación de Clerk.
 *
 * La validez real la comprueba Clerk al registrar la cuenta; esto solo decide
 * si la página de aceptación se muestra, para que la ruta no se convierta en
 * un registro abierto en el dominio del panel (la instancia de Clerk es
 * compartida con la tienda y su registro es público). Por eso se mira la
 * forma y la caducidad **sin** confiar en la firma.
 */
export type TicketProblem = "missing" | "malformed" | "expired";

export function readTicketProblem(ticket: unknown, now: Date = new Date()): TicketProblem | null {
  if (typeof ticket !== "string" || ticket.trim().length === 0) return "missing";
  const parts = ticket.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return "malformed";
  let payload: Record<string, unknown>;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return "malformed";
  }
  if (!payload || typeof payload !== "object") return "malformed";
  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 <= now.getTime()) return "expired";
  return null;
}

/** `true` cuando la página de aceptación puede mostrarse. */
export function hasUsableTicket(ticket: unknown, now?: Date): boolean {
  return readTicketProblem(ticket, now) === null;
}
