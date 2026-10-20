import { CapsuleDailySlotStatus, OrderStatus } from "@prisma/client";

/**
 * Los cupos de cápsulas de un día de Bogotá. Cuenta lo mismo que contará la
 * reserva de cupo del checkout (P4): cupos CONFIRMED más los HELD que no han
 * vencido. Todos los pedidos de cápsulas de la tienda cuentan, de cualquier
 * canal. El tope es el del día si la dueña lo cambió (`CapsuleDayCap`) o el de
 * la edición a la venta: solo puede haber una LIVE por tienda, así que ese es
 * el tope de la tienda (la capacidad de Paula).
 */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** «YYYY-MM-DD» del día en Bogotá. */
export const bogotaDay = (now: Date) => new Date(now.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
/** Minutos desde la medianoche de Bogotá. */
export const bogotaMinutes = (now: Date) => {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
/** El día de Bogotá como la fecha (`@db.Date`) de `CapsuleDailySlot`/`CapsuleDayCap`. */
export const bogotaDate = (now: Date) => new Date(`${bogotaDay(now)}T00:00:00.000Z`);
export const minutesOf = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

/** «08:00» → «8:00 a. m.» (la misma cuenta que la tienda en `lib/capsule-copy.ts`). */
export function formatOpensAt(hhmm: string): string {
  const [hoursRaw, minutes = "00"] = hhmm.split(":");
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours)) return hhmm;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes.padStart(2, "0")} ${hours < 12 ? "a. m." : "p. m."}`;
}

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

type SlotRow = { orderId: string; slotNumber: number; status: CapsuleDailySlotStatus; expiresAt: Date | null };

export type DaySlotsDb = {
  capsuleDailySlot: { findMany: (args: { where: { storeId: string; bogotaDate: Date }; select: { orderId: true; slotNumber: true; status: true; expiresAt: true } }) => Promise<SlotRow[]> };
  order: { findMany: (args: { where: { id: { in: string[] } }; select: { id: true; status: true } }) => Promise<{ id: string; status: OrderStatus }[]> };
};

/**
 * Los cupos de un día, separados en vivos y muertos. Un cupo está vivo si su
 * pedido existe, no está cancelado y el cupo está confirmado o apartado sin
 * vencer. Los muertos (apartado vencido, pedido cancelado o borrado) se
 * liberan al asignar: así cualquier camino de cancelación devuelve el cupo
 * sin tener que acordarse de hacerlo. Dos consultas acotadas al día.
 */
export async function daySlots(db: DaySlotsDb, storeId: string, bogotaDate: Date, now: Date) {
  const slots = await db.capsuleDailySlot.findMany({ where: { storeId, bogotaDate }, select: { orderId: true, slotNumber: true, status: true, expiresAt: true } });
  if (slots.length === 0) return { active: [] as SlotRow[], dead: [] as SlotRow[] };
  const orders = await db.order.findMany({ where: { id: { in: slots.map((slot) => slot.orderId) } }, select: { id: true, status: true } });
  const statusById = new Map(orders.map((order) => [order.id, order.status]));
  const active: SlotRow[] = [];
  const dead: SlotRow[] = [];
  for (const slot of slots) {
    const orderStatus = statusById.get(slot.orderId);
    const alive =
      orderStatus !== undefined &&
      orderStatus !== OrderStatus.CANCELLED &&
      (slot.status === CapsuleDailySlotStatus.CONFIRMED || (slot.expiresAt !== null && slot.expiresAt > now));
    (alive ? active : dead).push(slot);
  }
  return { active, dead };
}

type DayDb = DaySlotsDb & {
  capsuleDayCap: { findUnique: (args: { where: { storeId_bogotaDate: { storeId: string; bogotaDate: Date } }; select: { cap: true } }) => Promise<{ cap: number } | null> };
};

export async function capsuleDayStatus(db: DayDb, storeId: string, edition: { dailyOrderCap: number; opensAtLocal: string }, now: Date = new Date()): Promise<CapsuleDayStatus> {
  const day = bogotaDay(now);
  const date = new Date(`${day}T00:00:00.000Z`);
  const [override, slots] = await Promise.all([
    db.capsuleDayCap.findUnique({ where: { storeId_bogotaDate: { storeId, bogotaDate: date } }, select: { cap: true } }),
    daySlots(db, storeId, date, now),
  ]);
  const used = slots.active.length;
  const cap = override?.cap ?? edition.dailyOrderCap;
  const left = Math.max(0, cap - used);
  const closedReason = bogotaMinutes(now) < minutesOf(edition.opensAtLocal) ? "before-open" : left === 0 ? "full" : null;
  return { day, cap, used, left, opensAt: edition.opensAtLocal, closedReason };
}
