import { Prisma, PrismaClient, StockReservationStatus } from "@prisma/client";

import { AppError, ErrorFactory } from "./api-errors";
import { availableStock } from "./available-stock";
import { recalculateKitStock, resolvePhysicalRequirements } from "./inventory";
import { queueMarketplaceStockSyncEvents } from "./mercadolibre/outbox";
import { recordReservationEvents } from "./reservation-events";
import { headerLine, headerMirror, RESERVATION_LINES_SELECT, reservationLines, type ReservationLine } from "./reservation-header";

export { headerLine, reservationLines, RESERVATION_LINES_SELECT, type ReservationLine };

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export const HOLDING_RESERVATION_STATUSES: StockReservationStatus[] = [
  StockReservationStatus.ACTIVE,
  StockReservationStatus.CONVERTED,
];

/** Piezas físicas que guarda una reserva: un kit se reparte en sus componentes. */
export async function reservationPieces(tx: PrismaTx, productId: string, quantity: number): Promise<Map<string, number>> {
  return resolvePhysicalRequirements(tx as never, [{ productId, quantity }]);
}

/** Las piezas de varias líneas sumadas en un solo mapa (una sola subida o bajada del contador). */
export async function piecesForLines(tx: PrismaTx, lines: ReservationLine[]): Promise<Map<string, number>> {
  const positive = lines.filter((line) => line.quantity > 0);
  if (positive.length === 0) return new Map();
  return resolvePhysicalRequirements(tx as never, positive);
}

/**
 * Bloquea el encabezado (`FOR UPDATE`) antes de tocar sus ítems: dos ediciones
 * de la misma reserva se ordenan, y una que se cerró entre medio no se edita.
 */
export async function lockReservation(tx: PrismaTx, storeId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string; status: StockReservationStatus; orderId: string | null }[]>`
    SELECT \`id\`, \`status\`, \`orderId\` FROM \`StockReservation\`
     WHERE \`id\` = ${id} AND \`storeId\` = ${storeId}
     FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Deja el encabezado al día con sus ítems: el producto y la cantidad solo si
 * hay uno (si hay varios, null) y «sin respaldo» si algún ítem lo está.
 */
export async function syncReservationHeader(tx: PrismaTx, id: string): Promise<ReservationLine[]> {
  const items = await tx.stockReservationItem.findMany({
    where: { reservationId: id },
    orderBy: { createdAt: "asc" },
    select: { productId: true, quantity: true, unbackedAt: true },
  });
  const unbacked = items.map((item) => item.unbackedAt).filter((at): at is Date => at !== null);
  const lines = items.map(({ productId, quantity }) => ({ productId, quantity }));
  await tx.stockReservation.update({
    where: { id },
    data: {
      ...headerMirror(lines),
      unbackedAt: unbacked.length > 0 ? new Date(Math.min(...unbacked.map((at) => at.getTime()))) : null,
    },
  });
  return lines;
}

export { isDeadlock, withDeadlockRetry } from "./deadlock-retry";

/**
 * Sube o baja `reservedUnits` de las piezas en UNA sentencia. Al subir, cada
 * fila lleva su guarda (`stock - reservedUnits >= lo pedido`): si alguna no
 * alcanza, nada se aparta (la transacción se deshace con el error). Después
 * se recalculan los kits que llevan esas piezas y Mercado Libre se entera.
 * Devuelve los productos afectados (piezas y kits) para la purga de la tienda.
 */
export async function adjustReservedUnits(
  tx: PrismaTx,
  storeId: string,
  pieces: Map<string, number>,
  direction: "hold" | "free",
): Promise<string[]> {
  const entries = Array.from(pieces.entries()).filter(([, units]) => units > 0);
  if (entries.length === 0) return [];
  const ids = entries.map(([id]) => id);
  const delta = Prisma.sql`CASE \`id\` ${Prisma.join(entries.map(([id, units]) => Prisma.sql`WHEN ${id} THEN ${units}`), " ")} ELSE 0 END`;

  if (direction === "hold") {
    const affected = await tx.$executeRaw`
      UPDATE \`Product\`
         SET \`reservedUnits\` = \`reservedUnits\` + ${delta},
             \`updatedAt\` = NOW(3)
       WHERE \`storeId\` = ${storeId}
         AND \`id\` IN (${Prisma.join(ids)})
         AND \`stock\` - \`reservedUnits\` >= ${delta}`;
    if (affected !== ids.length) throw await insufficientError(tx, entries);
  } else {
    await tx.$executeRaw`
      UPDATE \`Product\`
         SET \`reservedUnits\` = GREATEST(0, \`reservedUnits\` - ${delta}),
             \`updatedAt\` = NOW(3)
       WHERE \`storeId\` = ${storeId}
         AND \`id\` IN (${Prisma.join(ids)})`;
  }

  const parents = await tx.productKit.findMany({ where: { componentId: { in: ids } }, select: { kitId: true } });
  const kitIds = Array.from(new Set(parents.map((row) => row.kitId)));
  if (kitIds.length > 0) await recalculateKitStock(tx as never, kitIds);
  const affectedIds = [...ids, ...kitIds];
  await queueMarketplaceStockSyncEvents(tx as never, affectedIds);
  return affectedIds;
}

async function insufficientError(tx: PrismaTx, entries: [string, number][]): Promise<AppError> {
  const products = await tx.product.findMany({
    where: { id: { in: entries.map(([id]) => id) } },
    select: { id: true, name: true, stock: true, reservedUnits: true },
  });
  const short = products
    .map((product) => ({ product, wanted: entries.find(([id]) => id === product.id)?.[1] ?? 0 }))
    .filter(({ product, wanted }) => availableStock(product) < wanted)
    .sort((a, b) => entries.findIndex(([id]) => id === a.product.id) - entries.findIndex(([id]) => id === b.product.id))
    .map(({ product, wanted }) => ({ productId: product.id, name: product.name, available: availableStock(product), requested: wanted }));
  const first = short[0];
  if (!first) return ErrorFactory.Conflict("El inventario cambió mientras reservabas. Intenta de nuevo.");
  const details = { productId: first.productId, available: first.available, requested: first.requested, short };
  if (short.length === 1) {
    return new AppError(
      first.available === 0
        ? `No hay unidades disponibles de «${first.name}» para reservar.`
        : `Solo ${first.available === 1 ? "queda 1 unidad disponible" : `quedan ${first.available} unidades disponibles`} de «${first.name}» y pediste ${first.requested}.`,
      409,
      details,
    );
  }
  const parts = short.map((row) => (row.available === 0 ? `«${row.name}» (no hay unidades)` : `«${row.name}» (quedan ${row.available}, pediste ${row.requested})`));
  return new AppError(`No alcanza para reservar: ${parts.join("; ")}.`, 409, details);
}

/**
 * Cambia el estado de una reserva solo si sigue en uno de los estados de
 * origen, en una sola sentencia. Devuelve false si otro ya lo movió: así
 * liberar, vencer o consumir dos veces no descuenta el contador dos veces.
 */
export async function claimReservation(
  tx: PrismaTx,
  input: {
    id: string;
    storeId: string;
    from: StockReservationStatus[];
    to: StockReservationStatus;
    closedBy?: string | null;
    orderId?: string | null;
  },
): Promise<boolean> {
  const closing = input.to !== StockReservationStatus.ACTIVE && input.to !== StockReservationStatus.CONVERTED;
  const affected = await tx.$executeRaw`
    UPDATE \`StockReservation\`
       SET \`status\` = ${input.to},
           \`orderId\` = COALESCE(${input.orderId ?? null}, \`orderId\`),
           \`closedBy\` = ${closing ? input.closedBy ?? null : null},
           \`closedAt\` = ${closing ? Prisma.sql`NOW(3)` : Prisma.sql`NULL`},
           \`updatedAt\` = NOW(3)
     WHERE \`id\` = ${input.id}
       AND \`storeId\` = ${input.storeId}
       AND \`status\` IN (${Prisma.join(input.from)})`;
  return affected === 1;
}

/**
 * Libera o consume las reservas ligadas a pedidos: se llama justo ANTES de
 * descontar la venta (para que la venta no choque con su propia reserva) y
 * al cancelar o borrar el pedido. Devuelve los productos afectados.
 */
export async function closeReservationsForOrders(
  tx: PrismaTx,
  orderIds: string[],
  to: "CONSUMED" | "RELEASED",
  closedBy: string | null = "SYSTEM",
): Promise<string[]> {
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const holds = await tx.stockReservation.findMany({
    where: { orderId: { in: ids }, status: StockReservationStatus.CONVERTED },
    select: { id: true, storeId: true, orderId: true, ...RESERVATION_LINES_SELECT },
  });
  const affected: string[] = [];
  for (const hold of holds ?? []) {
    const claimed = await claimReservation(tx, {
      id: hold.id,
      storeId: hold.storeId,
      from: [StockReservationStatus.CONVERTED],
      to: StockReservationStatus[to],
      closedBy,
    });
    if (!claimed) continue;
    const pieces = await piecesForLines(tx, reservationLines(hold));
    affected.push(...(await adjustReservedUnits(tx, hold.storeId, pieces, "free")));
    await recordReservationEvents(tx, [
      { storeId: hold.storeId, reservationId: hold.id, kind: to === "CONSUMED" ? "consumed" : "released", actor: closedBy, detail: { orderId: hold.orderId } },
    ]);
  }
  return Array.from(new Set(affected));
}
