/**
 * Reservas v2, fase 1: el encabezado todavía lleva su único producto. La fase
 * 2 lee los ítems y esto desaparece.
 */
export function headerLine<T extends { productId: string | null; quantity: number | null }>(
  hold: T,
): Omit<T, "productId" | "quantity"> & { productId: string; quantity: number } {
  if (!hold.productId || hold.quantity === null) throw new Error("La reserva no tiene producto en el encabezado");
  return hold as Omit<T, "productId" | "quantity"> & { productId: string; quantity: number };
}
