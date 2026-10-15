import { OrderSource, OrderStatus, OrderType, PaymentMethod, Prisma, StockReservationStatus } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";
import { calculateOrderTotals } from "@/lib/order-totals";
import { normalizePhone } from "@/lib/phone";
import prismadb from "@/lib/prismadb";
import { priceLines } from "@/lib/product-pricing";
import {
  HOLDING_RESERVATION_STATUSES,
  adjustReservedUnits,
  headerLine,
  claimReservation,
  reservationPieces,
  withDeadlockRetry,
} from "@/lib/reservation-counters";
import { generateOrderNumber } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RESERVATION_DAYS = 60;
export const MAX_RESERVATION_QUANTITY = 999;

export type ReservationListFilter = "activas" | "vencidas" | "convertidas" | "sin-respaldo" | "cerradas";

export const RESERVATION_SELECT = {
  id: true,
  productId: true,
  quantity: true,
  customerName: true,
  customerPhone: true,
  note: true,
  expiresAt: true,
  status: true,
  orderId: true,
  unbackedAt: true,
  createdAt: true,
  closedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      isKit: true,
      stock: true,
      reservedUnits: true,
      images: { where: { isMain: true }, take: 1, select: { url: true } },
    },
  },
  order: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.StockReservationSelect;

export type ReservationRow = Prisma.StockReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

function parseQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_RESERVATION_QUANTITY) {
    throw ErrorFactory.InvalidRequest("La cantidad debe ser un número entero entre 1 y 999");
  }
  return quantity;
}

function parseDays(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_RESERVATION_DAYS) {
    throw ErrorFactory.InvalidRequest(`Los días deben ser un número entero entre 1 y ${MAX_RESERVATION_DAYS}`);
  }
  return days;
}

function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) throw ErrorFactory.InvalidRequest("Escribe el nombre de la clienta (2 a 80 letras)");
  return name;
}

function parseNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.trim();
  if (note.length > 500) throw ErrorFactory.InvalidRequest("La nota puede tener hasta 500 caracteres");
  return note || null;
}

export async function createReservation(input: {
  storeId: string;
  productId: string;
  quantity: unknown;
  customerName: unknown;
  customerPhone?: unknown;
  note?: unknown;
  days?: unknown;
  createdBy: string;
  now?: Date;
}) {
  const quantity = parseQuantity(input.quantity);
  const customerName = parseName(input.customerName);
  const customerPhone = typeof input.customerPhone === "string" ? normalizePhone(input.customerPhone) : "";
  const note = parseNote(input.note);
  const store = await prismadb.store.findUnique({ where: { id: input.storeId }, select: { reservationDefaultDays: true } });
  if (!store) throw ErrorFactory.NotFound("Tienda no encontrada");
  const days = parseDays(input.days, store.reservationDefaultDays);
  const now = input.now ?? new Date();

  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, storeId: input.storeId },
      select: { id: true, name: true, isArchived: true, isKit: true, kitComponents: { select: { componentId: true } } },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
    if (product.isArchived) throw ErrorFactory.InvalidRequest(`«${product.name}» está archivado y no se puede reservar`);
    if (product.isKit && product.kitComponents.length === 0) {
      throw ErrorFactory.InvalidRequest(`El kit «${product.name}» no tiene productos configurados`);
    }
    const pieces = await reservationPieces(tx, product.id, quantity);
    const affectedProductIds = await adjustReservedUnits(tx, input.storeId, pieces, "hold").catch((error: unknown) => {
      if (product.isKit && error instanceof AppError && error.statusCode === 409) {
        throw new AppError(`No alcanza para reservar ${quantity} × el kit «${product.name}»: ${error.message}`, 409, error.details);
      }
      throw error;
    });
    const reservation = await tx.stockReservation.create({
      data: {
        storeId: input.storeId,
        productId: product.id,
        quantity,
        customerName,
        customerPhone,
        note,
        expiresAt: new Date(now.getTime() + days * DAY_MS),
        createdBy: input.createdBy,
      },
      select: RESERVATION_SELECT,
    });
    await tx.stockReservationItem.create({
      data: { storeId: input.storeId, reservationId: reservation.id, productId: product.id, quantity, addedBy: input.createdBy },
    });
    return { reservation, affectedProductIds: [product.id, ...affectedProductIds] };
  }));
}

async function closeOne(
  storeId: string,
  id: string,
  from: StockReservationStatus[],
  to: StockReservationStatus,
  closedBy: string,
) {
  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    const found = await tx.stockReservation.findFirst({ where: { id, storeId }, select: { id: true, productId: true, quantity: true, status: true } });
    if (!found) throw ErrorFactory.NotFound("Reserva no encontrada");
    const claimed = await claimReservation(tx, { id, storeId, from, to, closedBy });
    if (!claimed) return { changed: false as const, affectedProductIds: [] as string[] };
    const hold = headerLine(found);
    const pieces = await reservationPieces(tx, hold.productId, hold.quantity);
    const affected = await adjustReservedUnits(tx, storeId, pieces, "free");
    return { changed: true as const, affectedProductIds: [hold.productId, ...affected] };
  }));
}

/** «Liberar»: las unidades vuelven a estar a la venta. Una reserva ya cerrada no hace nada. */
export function releaseReservation(storeId: string, id: string, closedBy: string) {
  return closeOne(storeId, id, HOLDING_RESERVATION_STATUSES, StockReservationStatus.RELEASED, closedBy);
}

/** Vence una reserva sin pedido. Los convertidos no vencen solos: avisan (ver `sweepStockReservations`). */
export function expireReservation(storeId: string, id: string) {
  return closeOne(storeId, id, [StockReservationStatus.ACTIVE], StockReservationStatus.EXPIRED, "SYSTEM");
}

/** «+ días»: corre el vencimiento desde hoy o desde la fecha que ya tenía, la que sea más tarde. */
export async function extendReservation(storeId: string, id: string, daysInput: unknown, now = new Date()) {
  const days = parseDays(daysInput, 1);
  const hold = await prismadb.stockReservation.findFirst({ where: { id, storeId }, select: { expiresAt: true } });
  if (!hold) throw ErrorFactory.NotFound("Reserva no encontrada");
  const base = Math.max(hold.expiresAt.getTime(), now.getTime());
  const affected = await prismadb.$executeRaw`
    UPDATE \`StockReservation\`
       SET \`expiresAt\` = ${new Date(base + days * DAY_MS)}, \`updatedAt\` = NOW(3)
     WHERE \`id\` = ${id} AND \`storeId\` = ${storeId}
       AND \`status\` IN (${Prisma.join(HOLDING_RESERVATION_STATUSES)})`;
  if (affected !== 1) throw ErrorFactory.Conflict("Esta reserva ya se cerró; no se puede extender");
  return prismadb.stockReservation.findFirstOrThrow({ where: { id, storeId }, select: RESERVATION_SELECT });
}

/**
 * «Convertir en pedido»: pedido PENDIENTE del panel con la clienta y el
 * producto al precio de hoy. La reserva sigue guardando las unidades hasta
 * que el pedido se pague (la venta las consume) o se cancele (se liberan).
 * El pago queda como transferencia por defecto; Paula lo cambia en el pedido.
 */
export async function convertReservation(storeId: string, id: string, createdBy: string) {
  const found = await prismadb.stockReservation.findFirst({
    where: { id, storeId },
    select: { id: true, status: true, orderId: true, productId: true, quantity: true, customerName: true, customerPhone: true, note: true },
  });
  if (!found) throw ErrorFactory.NotFound("Reserva no encontrada");
  if (found.status === StockReservationStatus.CONVERTED && found.orderId) return { orderId: found.orderId, existing: true };
  if (found.status !== StockReservationStatus.ACTIVE) throw ErrorFactory.Conflict("Solo una reserva activa se puede convertir en pedido");
  const hold = headerLine(found);

  const product = await prismadb.product.findFirstOrThrow({
    where: { id: hold.productId, storeId },
    select: { id: true, name: true, sku: true, price: true, categoryId: true, productGroupId: true, images: { orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } } },
  });
  const priced = await priceLines(storeId, [{ productId: product.id, quantity: hold.quantity }], [product]);
  const unitPrice = Math.round(priced.get(product.id)?.unitPrice ?? product.price);
  const totals = calculateOrderTotals([{ product: { price: unitPrice }, quantity: hold.quantity }]);

  return prismadb.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        storeId,
        orderNumber: generateOrderNumber(),
        type: OrderType.STANDARD,
        status: OrderStatus.PENDING,
        source: OrderSource.PANEL,
        createdBy,
        fullName: hold.customerName,
        phone: hold.customerPhone,
        subtotal: totals.subtotal,
        total: totals.total,
        internalNotes: [`Pedido creado desde una reserva de ${hold.customerName}.`, hold.note].filter(Boolean).join(" "),
        orderItems: {
          create: [{ productId: product.id, quantity: hold.quantity, name: product.name, sku: product.sku, price: unitPrice, imageUrl: product.images[0]?.url ?? "" }],
        },
        payment: { create: { method: PaymentMethod.BankTransfer, storeId } },
      },
      select: { id: true },
    });
    const claimed = await claimReservation(tx, {
      id,
      storeId,
      from: [StockReservationStatus.ACTIVE],
      to: StockReservationStatus.CONVERTED,
      orderId: order.id,
    });
    if (!claimed) throw ErrorFactory.Conflict("La reserva cambió mientras la convertías. Actualiza e intenta de nuevo.");
    return { orderId: order.id, existing: false };
  });
}

export function reservationListWhere(storeId: string, filter: ReservationListFilter, now = new Date()): Prisma.StockReservationWhereInput {
  switch (filter) {
    case "vencidas":
      return { storeId, OR: [{ status: StockReservationStatus.EXPIRED }, { status: { in: HOLDING_RESERVATION_STATUSES }, expiresAt: { lt: now } }] };
    case "convertidas":
      return { storeId, status: StockReservationStatus.CONVERTED };
    case "sin-respaldo":
      return { storeId, status: { in: HOLDING_RESERVATION_STATUSES }, unbackedAt: { not: null } };
    case "cerradas":
      return { storeId, status: { in: [StockReservationStatus.CONSUMED, StockReservationStatus.RELEASED, StockReservationStatus.EXPIRED] } };
    case "activas":
    default:
      return { storeId, status: { in: HOLDING_RESERVATION_STATUSES } };
  }
}

export async function listReservations(storeId: string, filter: ReservationListFilter = "activas", now = new Date()) {
  const closed = filter === "cerradas" || filter === "vencidas";
  return prismadb.stockReservation.findMany({
    where: reservationListWhere(storeId, filter, now),
    select: RESERVATION_SELECT,
    orderBy: closed ? [{ updatedAt: "desc" }] : [{ expiresAt: "asc" }],
    take: 200,
  });
}

export const isReservationFilter = (value: string | null): value is ReservationListFilter =>
  value === "activas" || value === "vencidas" || value === "convertidas" || value === "sin-respaldo" || value === "cerradas";
