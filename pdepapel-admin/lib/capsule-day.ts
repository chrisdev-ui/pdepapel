import { CapsuleDailySlotStatus } from "@prisma/client";

/**
 * Los cupos de cápsulas de un día de Bogotá. Cuenta lo mismo que contará la
 * reserva de cupo del checkout (P4): cupos CONFIRMED más los HELD que no han
 * vencido. Todos los pedidos de cápsulas de la tienda cuentan, de cualquier
 * canal. El tope es el del día si la dueña lo cambió (`CapsuleDayCap`) o el de
 * la edición; con dos ediciones a la venta el mismo día el tope sería ambiguo
 * (pendiente para P4).
 */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** «YYYY-MM-DD» del día en Bogotá. */
export const bogotaDay = (now: Date) => new Date(now.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
/** Minutos desde la medianoche de Bogotá. */
export const bogotaMinutes = (now: Date) => {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
const minutesOf = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

export interface CapsuleDayStatus {
  /** Día de Bogotá («YYYY-MM-DD»). */
  day: string;
  cap: number;
  used: number;
  left: number;
  /** Hora local en que abren los cupos («08:00»). */
  opensAt: string;
  /** `before-open`: todavía no abren hoy; `full`: se acabaron los de hoy; null: hay cupo. */
  closedReason: "before-open" | "full" | null;
}

type DayDb = {
  capsuleDayCap: { findUnique: (args: { where: { storeId_bogotaDate: { storeId: string; bogotaDate: Date } }; select: { cap: true } }) => Promise<{ cap: number } | null> };
  capsuleDailySlot: { count: (args: { where: object }) => Promise<number> };
};

export async function capsuleDayStatus(db: DayDb, storeId: string, edition: { dailyOrderCap: number; opensAtLocal: string }, now: Date = new Date()): Promise<CapsuleDayStatus> {
  const day = bogotaDay(now);
  const bogotaDate = new Date(`${day}T00:00:00.000Z`);
  const [override, used] = await Promise.all([
    db.capsuleDayCap.findUnique({ where: { storeId_bogotaDate: { storeId, bogotaDate } }, select: { cap: true } }),
    db.capsuleDailySlot.count({
      where: {
        storeId,
        bogotaDate,
        OR: [{ status: CapsuleDailySlotStatus.CONFIRMED }, { status: CapsuleDailySlotStatus.HELD, expiresAt: { gt: now } }],
      },
    }),
  ]);
  const cap = override?.cap ?? edition.dailyOrderCap;
  const left = Math.max(0, cap - used);
  const closedReason = bogotaMinutes(now) < minutesOf(edition.opensAtLocal) ? "before-open" : left === 0 ? "full" : null;
  return { day, cap, used, left, opensAt: edition.opensAtLocal, closedReason };
}
