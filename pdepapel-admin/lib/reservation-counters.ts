import { Prisma, PrismaClient, StockReservationStatus } from "@prisma/client";

import { AppError, ErrorFactory } from "./api-errors";
import { availableStock } from "./available-stock";
import { recalculateKitStock, resolvePhysicalRequirements } from "./inventory";
import { queueMarketplaceStockSyncEvents } from "./mercadolibre/outbox";
import { headerLine } from "./reservation-header";

export { headerLine };

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export const HOLDING_RESERVATION_STATUSES: StockReservationStatus[] = [
  StockReservationStatus.ACTIVE,
  StockReservationStatus.CONVERTED,
];

/** Piezas físicas que guarda una reserva: un kit se reparte en sus componentes. */
export async function reservationPieces(tx: PrismaTx, productId: string, quantity: number): Promise<Map<string, number>> {
  return resolvePhysicalRequirements(tx as never, [{ productId, quantity }]);
}

/**
 * Las transacciones corren en Serializable: cada lectura toma un bloqueo
 * compartido, así que dos reservas del mismo producto lo leen las dos y al
 * escribirlo InnoDB mata una por deadlock. Se repite la transacción entera;
 * en el segundo intento la guarda ya ve la unidad tomada y responde 409.
 */
export async function withDeadlockRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= attempts || !isDeadlock(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)));
    }
  }
}

export function isDeadlock(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2034" || (error.code === "P2010" && String((error.meta as { code?: unknown } | undefined)?.code) === "1213");
}

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
    .filter(({ product, wanted }) => availableStock(product) < wanted);
  const first = short[0];
  if (!first) return ErrorFactory.Conflict("El inventario cambió mientras reservabas. Intenta de nuevo.");
  const available = availableStock(first.product);
  return new AppError(
    available === 0
      ? `No hay unidades disponibles de «${first.product.name}» para reservar.`
      : `Solo ${available === 1 ? "queda 1 unidad disponible" : `quedan ${available} unidades disponibles`} de «${first.product.name}» y pediste ${first.wanted}.`,
    409,
    { productId: first.product.id, available, requested: first.wanted },
  );
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
    select: { id: true, storeId: true, productId: true, quantity: true },
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
    const line = headerLine(hold);
    const pieces = await reservationPieces(tx, line.productId, line.quantity);
    affected.push(...(await adjustReservedUnits(tx, hold.storeId, pieces, "free")));
  }
  return Array.from(new Set(affected));
}
