import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";

/**
 * Vigencia de una promoción (oferta o cupón).
 *
 * Una vigencia es un rango de días calendario en hora de Colombia: empieza a
 * las 00:00 del primer día y termina a las 23:59:59.999 del último. En la base
 * de datos se guardan los instantes UTC equivalentes y toda comparación se hace
 * contra el reloj real (`new Date()`), nunca contra una fecha «desplazada» a
 * hora local (eso era lo que hacía `getColombiaDate`, que resta cinco horas al
 * instante y no sirve para comparar con lo guardado).
 */
export const PROMOTION_TIME_ZONE = "America/Bogota";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PromotionWindow {
  startDate: Date;
  endDate: Date;
}

/**
 * Día calendario (`yyyy-MM-dd`) que representa la entrada: acepta el día ya
 * escrito así, un instante ISO o un `Date`; un instante se lee en hora de
 * Colombia. Devuelve `null` cuando no es una fecha.
 */
export function parsePromotionDay(input: unknown): string | null {
  if (typeof input === "string" && DAY_PATTERN.test(input)) {
    const probe = new Date(`${input}T12:00:00Z`);
    return Number.isNaN(probe.getTime()) ? null : input;
  }
  const date = input instanceof Date ? input : typeof input === "string" ? new Date(input) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return formatInTimeZone(date, PROMOTION_TIME_ZONE, "yyyy-MM-dd");
}

/** Primer instante del día en Colombia. */
export function promotionDayStart(day: string): Date {
  return zonedTimeToUtc(`${day}T00:00:00.000`, PROMOTION_TIME_ZONE);
}

/** Último instante del día en Colombia. */
export function promotionDayEnd(day: string): Date {
  return zonedTimeToUtc(`${day}T23:59:59.999`, PROMOTION_TIME_ZONE);
}

export type PromotionWindowResult =
  | { ok: true; window: PromotionWindow; startDay: string; endDay: string }
  | { ok: false; error: string };

/** Convierte las fechas recibidas en la vigencia completa de ambos días. */
export function normalizePromotionWindow(startInput: unknown, endInput: unknown): PromotionWindowResult {
  const startDay = parsePromotionDay(startInput);
  const endDay = parsePromotionDay(endInput);
  if (!startDay) return { ok: false, error: "La fecha de inicio no es válida" };
  if (!endDay) return { ok: false, error: "La fecha de finalización no es válida" };
  if (endDay < startDay) {
    return { ok: false, error: "La fecha de inicio no puede ser posterior a la de finalización" };
  }
  return {
    ok: true,
    startDay,
    endDay,
    window: { startDate: promotionDayStart(startDay), endDate: promotionDayEnd(endDay) },
  };
}

/** Filtro Prisma «vigente ahora» compartido por cupones y ofertas. */
export function promotionWindowFilter(now: Date = new Date()) {
  return { startDate: { lte: now }, endDate: { gte: now } };
}

/**
 * `Date` local a medianoche del día de Colombia guardado, para los selectores
 * de rango del panel (que trabajan con días locales del navegador).
 */
export function promotionDayToLocalDate(value: Date | string): Date {
  const day = parsePromotionDay(value);
  if (!day) return new Date(NaN);
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  return new Date(year, month - 1, dayOfMonth);
}

/** Día calendario local (`yyyy-MM-dd`) de un `Date` del navegador. */
export function localDateToPromotionDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
