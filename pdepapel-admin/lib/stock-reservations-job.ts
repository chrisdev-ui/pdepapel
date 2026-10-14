import { OrderStatus, StockReservationStatus } from "@prisma/client";
import { Redis } from "@upstash/redis";

import { invalidateStoreProductsCache } from "@/lib/cache";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import { HOLDING_RESERVATION_STATUSES, reservationPieces } from "@/lib/reservation-counters";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { expireReservation, releaseReservation } from "@/lib/stock-reservations";

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DIGEST_HOUR_BOGOTA = 8;
const MAX_PER_RUN = 200;
const ALERT_TTL_SECONDS = 60 * 60 * 24 * 30;
const CLOSED_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

const bogotaDate = (date: Date) => new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
const bogotaHour = (date: Date) => new Date(date.getTime() + BOGOTA_OFFSET_MS).getUTCHours();
/** Fin del día de hoy en Bogotá (en UTC). */
const endOfBogotaDay = (date: Date) => new Date(Date.parse(`${bogotaDate(date)}T23:59:59.999Z`) - BOGOTA_OFFSET_MS);
const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" }).format(date);

async function claimOnce(key: string): Promise<boolean> {
  if (env.NODE_ENV !== "production") return true;
  try {
    return (await Redis.fromEnv().set(key, "1", { ex: ALERT_TTL_SECONDS, nx: true })) === "OK";
  } catch (error) {
    console.error("[STOCK_RESERVATIONS] No se pudo registrar el aviso; se envía igual:", error);
    return true;
  }
}

/** Un correo que falla no detiene la corrida: los vencimientos ya se aplicaron y el registro del job debe quedar. */
async function send(storeId: string, subject: string, text: string): Promise<boolean> {
  try {
    const to = await getAdminNotificationRecipients(storeId);
    if (to.length === 0) return false;
    await resend.emails.send({ from: "Papelería P de Papel <orders@papeleriapdepapel.com>", to, subject, text });
    return true;
  } catch (error) {
    console.error(`[STOCK_RESERVATIONS] No se pudo enviar «${subject}»:`, error);
    return false;
  }
}

export interface SweepResult {
  expired: number;
  releasedForClosedOrders: number;
  convertedOverdueAlerts: number;
  driftProducts: number;
  digestSent: number;
}

/**
 * Corrida horaria de reservas (programación de QStash):
 * 1. vence las reservas ACTIVAS pasados de fecha (las unidades vuelven a la venta);
 * 2. libera los convertidos cuyo pedido se canceló o se borró;
 * 3. avisa, sin liberar, de los convertidos vencidos con el pedido sin pagar;
 * 4. compara el contador de cada pieza con la suma de sus reservas y avisa si no cuadra (no corrige);
 * 5. a las 8:00 de Bogotá, el resumen del día (si hay algo que contar).
 * Cada paso es idempotente: los cambios de estado son reclamos de una sola sentencia.
 */
export async function sweepStockReservations(options: { now?: Date; forceDigest?: boolean } = {}): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const result: SweepResult = { expired: 0, releasedForClosedOrders: 0, convertedOverdueAlerts: 0, driftProducts: 0, digestSent: 0 };
  const touched = new Map<string, Set<string>>();
  const touch = (storeId: string, ids: string[]) => {
    const set = touched.get(storeId) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    touched.set(storeId, set);
  };

  const due = await prismadb.stockReservation.findMany({
    where: { status: StockReservationStatus.ACTIVE, expiresAt: { lt: now } },
    select: { id: true, storeId: true },
    orderBy: { expiresAt: "asc" },
    take: MAX_PER_RUN,
  });
  for (const hold of due) {
    const outcome = await expireReservation(hold.storeId, hold.id);
    if (outcome.changed) {
      result.expired += 1;
      touch(hold.storeId, outcome.affectedProductIds);
    }
  }

  const converted = await prismadb.stockReservation.findMany({
    where: { status: StockReservationStatus.CONVERTED },
    select: { id: true, storeId: true, expiresAt: true, customerName: true, quantity: true, product: { select: { name: true } }, order: { select: { status: true, orderNumber: true } } },
    take: MAX_PER_RUN,
  });
  const overdue = [];
  for (const hold of converted) {
    if (!hold.order || CLOSED_ORDER_STATUSES.includes(hold.order.status)) {
      const outcome = await releaseReservation(hold.storeId, hold.id, "SYSTEM");
      if (outcome.changed) {
        result.releasedForClosedOrders += 1;
        touch(hold.storeId, outcome.affectedProductIds);
      }
      continue;
    }
    if (hold.expiresAt < now && (await claimOnce(`alert:reservation-converted-overdue:${hold.id}:${hold.expiresAt.getTime()}`))) overdue.push(hold);
  }
  for (const [storeId, rows] of Array.from(groupBy(overdue, (row) => row.storeId))) {
    const lines = rows.map((row) => `• ${row.product.name} × ${row.quantity} — ${row.customerName}, pedido ${row.order!.orderNumber}`).join("\n");
    if (await send(storeId, `[Reservas] ${rows.length === 1 ? "Un pedido de reserva venció" : `${rows.length} pedidos de reservas vencieron`} sin pagar`,
      `Estas reservas ya tienen pedido, pero se venció la fecha y el pedido sigue sin pagar:\n${lines}\n\n` +
        "Las unidades siguen guardadas. Si la clienta no va a pagar, cancela el pedido y las unidades vuelven a la venta; si sí, dale más días a la reserva.")) {
      result.convertedOverdueAlerts += rows.length;
    }
  }

  for (const [storeId, ids] of Array.from(touched)) {
    await invalidateStoreProductsCache(storeId, { productIds: Array.from(ids) });
  }

  result.driftProducts = await checkReservationDrift(now);

  if (options.forceDigest || bogotaHour(now) === DIGEST_HOUR_BOGOTA) {
    const stores = await prismadb.store.findMany({ select: { id: true } });
    for (const store of stores) {
      if (!options.forceDigest && !(await claimOnce(`digest:stock-reservations:${store.id}:${bogotaDate(now)}`))) continue;
      if (await sendDailyDigest(store.id, now)) result.digestSent += 1;
    }
  }

  await recordJobRun("stock-reservations", {
    ok: true,
    detail: `${result.expired} vencidos, ${result.releasedForClosedOrders} liberados por pedido cancelado, ${result.convertedOverdueAlerts} avisos de convertidos vencidos, ${result.driftProducts} piezas descuadradas, ${result.digestSent} resúmenes`,
    ranAt: now,
  });
  return result;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

/**
 * El contador de cada pieza (no kit: el de un kit se deriva) debe ser la
 * suma de lo que guardan sus reservas vigentes. Si no cuadra se avisa una
 * vez por día con las cuentas; arreglarlo es una decisión, no un efecto.
 */
async function expectedReservedUnits(): Promise<Map<string, number>> {
  const holds = await prismadb.stockReservation.findMany({
    where: { status: { in: HOLDING_RESERVATION_STATUSES } },
    select: { productId: true, quantity: true },
  });
  const expected = new Map<string, number>();
  for (const hold of holds) {
    const pieces = await reservationPieces(prismadb, hold.productId, hold.quantity);
    pieces.forEach((units, id) => expected.set(id, (expected.get(id) ?? 0) + units));
  }
  return expected;
}

async function driftedProducts(expected: Map<string, number>, onlyIds?: string[]) {
  const products = await prismadb.product.findMany({
    where: onlyIds
      ? { id: { in: onlyIds } }
      : { isKit: false, OR: [{ reservedUnits: { not: 0 } }, { id: { in: Array.from(expected.keys()) } }] },
    select: { id: true, storeId: true, name: true, isKit: true, reservedUnits: true },
  });
  return products.filter((product) => !product.isKit && product.reservedUnits !== (expected.get(product.id) ?? 0));
}

export async function checkReservationDrift(now = new Date()): Promise<number> {
  const firstPass = await driftedProducts(await expectedReservedUnits());
  if (firstPass.length === 0) return 0;
  // Las dos lecturas no son una transacción: una reserva creada entre ellas parece un descuadre. Se confirma una vez.
  const expected = await expectedReservedUnits();
  const off = await driftedProducts(expected, firstPass.map((product) => product.id));
  for (const [storeId, rows] of Array.from(groupBy(off, (row) => row.storeId))) {
    if (!(await claimOnce(`alert:reservation-drift:${storeId}:${bogotaDate(now)}`))) continue;
    const lines = rows.slice(0, 20).map((row) => `• ${row.name}: el contador dice ${row.reservedUnits}, las reservas suman ${expected.get(row.id) ?? 0}`).join("\n");
    await send(storeId, `[Revisar] Reservas descuadradas en ${rows.length} ${rows.length === 1 ? "producto" : "productos"}`,
      `El número de unidades reservadas no coincide con las reservas vigentes:\n${lines}\n\nNo se corrigió nada automáticamente. Revisa las reservas de esos productos.`);
  }
  return off.length;
}

/** Resumen de las 8:00. Devuelve false (sin correo) si no hay nada que contar. */
export async function sendDailyDigest(storeId: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const select = { quantity: true, customerName: true, expiresAt: true, product: { select: { name: true } }, order: { select: { orderNumber: true } } } as const;
  const [expiringToday, expired, convertedUnpaid, unbacked] = await Promise.all([
    prismadb.stockReservation.findMany({ where: { storeId, status: StockReservationStatus.ACTIVE, expiresAt: { gte: now, lte: endOfBogotaDay(now) } }, select }),
    prismadb.stockReservation.findMany({ where: { storeId, status: StockReservationStatus.EXPIRED, closedAt: { gte: since } }, select }),
    prismadb.stockReservation.findMany({ where: { storeId, status: StockReservationStatus.CONVERTED }, select }),
    prismadb.stockReservation.findMany({ where: { storeId, status: { in: HOLDING_RESERVATION_STATUSES }, unbackedAt: { not: null } }, select }),
  ]);
  const text = renderDigest({ expiringToday, expired, convertedUnpaid, unbacked });
  if (!text) return false;
  return send(storeId, `[Reservas] Resumen del ${formatDay(now)}`, text);
}

type DigestRow = { quantity: number; customerName: string; expiresAt: Date; product: { name: string }; order: { orderNumber: string } | null };

export function renderDigest(buckets: { expiringToday: DigestRow[]; expired: DigestRow[]; convertedUnpaid: DigestRow[]; unbacked: DigestRow[] }): string | null {
  const line = (row: DigestRow) => `• ${row.product.name} × ${row.quantity} — ${row.customerName}${row.order ? ` (pedido ${row.order.orderNumber})` : ""}`;
  const sections = [
    ["Vencen hoy", buckets.expiringToday],
    ["Vencieron desde el último resumen (ya están otra vez a la venta)", buckets.expired],
    ["Convertidos en pedido y sin pagar", buckets.convertedUnpaid],
    ["Sin respaldo (una venta pagada se llevó las unidades)", buckets.unbacked],
  ] as const;
  const filled = sections.filter(([, rows]) => rows.length > 0);
  if (filled.length === 0) return null;
  return filled.map(([title, rows]) => `${title} (${rows.length}):\n${rows.map(line).join("\n")}`).join("\n\n") + "\n\nTodo esto está en el panel, en Reservas.";
}
