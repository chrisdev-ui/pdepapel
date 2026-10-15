/**
 * Líneas de una reserva (Reservas v2). Lo que se guarda vive en sus ítems; el
 * encabezado solo refleja el producto cuando hay exactamente uno. Sin
 * dependencias para que lo importen los contadores y la revisión de stock sin
 * ciclos.
 */
export type ReservationLine = { productId: string; quantity: number };

type HeaderFields = { productId: string | null; quantity: number | null };

export function headerLine<T extends HeaderFields>(hold: T): Omit<T, "productId" | "quantity"> & { productId: string; quantity: number } {
  if (!hold.productId || hold.quantity === null) throw new Error("La reserva no tiene producto en el encabezado");
  return hold as Omit<T, "productId" | "quantity"> & { productId: string; quantity: number };
}

/** Los ítems; una reserva sin ítems (anterior al backfill) usa el encabezado. Se va en la contracción. */
export function reservationLines(hold: HeaderFields & { items?: ReservationLine[] | null }): ReservationLine[] {
  if (hold.items && hold.items.length > 0) return hold.items.map(({ productId, quantity }) => ({ productId, quantity }));
  const line = headerLine(hold);
  return [{ productId: line.productId, quantity: line.quantity }];
}

/** Lo que se escribe en el encabezado: el producto solo si es uno. */
export function headerMirror(lines: ReservationLine[]): HeaderFields {
  return lines.length === 1 ? { productId: lines[0].productId, quantity: lines[0].quantity } : { productId: null, quantity: null };
}

export const RESERVATION_LINES_SELECT = {
  productId: true,
  quantity: true,
  items: { select: { productId: true, quantity: true } },
} as const;
