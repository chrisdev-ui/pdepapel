/** « · 2 reservados» junto al stock; nada si no hay reservas. */
export function reservedSuffix(reserved: number | null | undefined): string {
  if (!reserved || reserved <= 0) return "";
  return ` · ${reserved} ${reserved === 1 ? "reservado" : "reservados"}`;
}

/** Cuenta regresiva corta: «vence hoy», «vence mañana», «vence en 3 días», «venció hace 2 días». */
export function expiryLabel(expiresAt: Date | string, now: Date = new Date()): string {
  const day = (date: Date) => {
    const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  };
  const diff = Math.round((day(new Date(expiresAt)) - day(now)) / 86_400_000);
  if (diff === 0) return new Date(expiresAt) < now ? "venció hoy" : "vence hoy";
  if (diff === 1) return "vence mañana";
  if (diff > 1) return `vence en ${diff} días`;
  if (diff === -1) return "venció ayer";
  return `venció hace ${-diff} días`;
}

/** Línea de la hoja «Reservar»: lo que se puede reservar y, si hay reservas, el stock y lo reservado. */
export function reservableLine(stock: number, reserved: number | null | undefined): string {
  const held = reserved && reserved > 0 ? reserved : 0;
  const available = Math.max(0, stock - held);
  const head = available === 0 ? "No hay unidades disponibles para reservar" : `Disponibles para reservar: ${available}`;
  return held > 0 ? `${head} · stock ${stock}${reservedSuffix(held)}` : available === 0 ? `${head}.` : head;
}
