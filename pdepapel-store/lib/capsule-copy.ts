/** «08:00» → «8:00 a. m.»; «14:30» → «2:30 p. m.». */
export function formatOpensAt(hhmm: string): string {
  const [hoursRaw, minutes = "00"] = hhmm.split(":");
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours)) return hhmm;
  const suffix = hours < 12 ? "a. m." : "p. m.";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${minutes.padStart(2, "0")} ${suffix}`;
}

/** El aviso de cupos del día, en una línea. */
export function dayMessage(day: { cap: number; left: number; opensAt: string; closedReason: "before-open" | "full" | null }): { headline: string; detail: string | null } {
  const opens = formatOpensAt(day.opensAt);
  if (day.closedReason === "before-open") return { headline: `Cupos de hoy: ${day.left} de ${day.cap}`, detail: `Abren hoy a las ${opens}` };
  if (day.closedReason === "full") return { headline: `Cupos de hoy: 0 de ${day.cap}`, detail: `Vuelve mañana a las ${opens}` };
  return { headline: `Cupos de hoy: ${day.left} de ${day.cap}`, detail: null };
}
