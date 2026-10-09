import type { OrderType } from "@prisma/client";
import { addDays, format, parseISO } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";

import { getOrderChannel, type SalesChannel } from "@/lib/order-queues";

/**
 * Canal y fecha de la lista de Pedidos. Se combinan con las pestañas (colas):
 * la pestaña dice en qué estado está el pedido y estos filtros, de dónde vino
 * y cuándo. Los días son de Colombia, como en el resto del panel.
 */

const TZ = "America/Bogota";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ORDER_CHANNEL_FILTERS: { id: SalesChannel; label: string }[] = [
  { id: "tienda", label: "Tienda en línea" },
  { id: "presencial", label: "Presencial (punto de venta)" },
  { id: "feria", label: "Feria" },
  { id: "cotizacion", label: "Cotización" },
  { id: "personalizado", label: "Personalizado" },
  { id: "regalo", label: "Tarjeta de regalo" },
];

export type OrderDateFilter =
  | { kind: "todas" }
  | { kind: "hoy" }
  | { kind: "ayer" }
  | { kind: "7dias" }
  | { kind: "rango"; from: string; to: string };

export const ORDER_DATE_FILTERS: { kind: OrderDateFilter["kind"]; label: string }[] = [
  { kind: "todas", label: "Cualquier fecha" },
  { kind: "hoy", label: "Hoy" },
  { kind: "ayer", label: "Ayer" },
  { kind: "7dias", label: "Últimos 7 días" },
  { kind: "rango", label: "Elegir fechas" },
];

export interface OrderListFilters {
  channel: SalesChannel | null;
  date: OrderDateFilter;
}

const isChannel = (value: string | null): value is SalesChannel =>
  ORDER_CHANNEL_FILTERS.some((option) => option.id === value);

export function parseOrderListFilters(query: URLSearchParams): OrderListFilters {
  const channel = query.get("canal");
  const kind = query.get("fecha");
  let date: OrderDateFilter = { kind: "todas" };
  if (kind === "hoy" || kind === "ayer" || kind === "7dias") date = { kind };
  if (kind === "rango") {
    const from = query.get("desde") ?? "";
    const to = query.get("hasta") ?? "";
    if (DAY.test(from) && DAY.test(to)) date = { kind: "rango", from, to };
  }
  return { channel: isChannel(channel) ? channel : null, date };
}

export function writeOrderListFilters(query: URLSearchParams, filters: OrderListFilters) {
  for (const key of ["canal", "fecha", "desde", "hasta"]) query.delete(key);
  if (filters.channel) query.set("canal", filters.channel);
  if (filters.date.kind !== "todas") query.set("fecha", filters.date.kind);
  if (filters.date.kind === "rango") {
    query.set("desde", filters.date.from);
    query.set("hasta", filters.date.to);
  }
}

export function colombiaDay(now = new Date()) {
  return format(utcToZonedTime(now, TZ), "yyyy-MM-dd");
}

function dayStart(day: string) {
  return zonedTimeToUtc(`${day}T00:00:00`, TZ);
}

function shiftDay(day: string, days: number) {
  return format(addDays(parseISO(day), days), "yyyy-MM-dd");
}

/** Días completos de Colombia: `from` y `to` incluidos. */
export function colombiaDaysRange(from: string, to: string) {
  const [first, last] = from <= to ? [from, to] : [to, from];
  return { start: dayStart(first), end: new Date(dayStart(shiftDay(last, 1)).getTime() - 1) };
}

export function getOrderDateRange(filter: OrderDateFilter, now = new Date()) {
  const today = colombiaDay(now);
  switch (filter.kind) {
    case "hoy":
      return colombiaDaysRange(today, today);
    case "ayer":
      return colombiaDaysRange(shiftDay(today, -1), shiftDay(today, -1));
    case "7dias":
      return colombiaDaysRange(shiftDay(today, -6), today);
    case "rango":
      return colombiaDaysRange(filter.from, filter.to);
    default:
      return null;
  }
}

export function orderMatchesListFilters(
  order: { type: OrderType; createdAt: Date | string },
  filters: OrderListFilters,
  now = new Date(),
) {
  if (filters.channel && getOrderChannel(order.type).id !== filters.channel) return false;
  const range = getOrderDateRange(filters.date, now);
  if (!range) return true;
  const created = new Date(order.createdAt).getTime();
  return created >= range.start.getTime() && created <= range.end.getTime();
}

export function hasActiveListFilters(filters: OrderListFilters) {
  return Boolean(filters.channel) || filters.date.kind !== "todas";
}
