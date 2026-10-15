import { OrderSource, OrderStatus, OrderType, PaymentMethod, Prisma, PrismaClient, StockReservationStatus } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";
import { calculateOrderTotals } from "@/lib/order-totals";
import { normalizePhone } from "@/lib/phone";
import prismadb from "@/lib/prismadb";
import { priceLines } from "@/lib/product-pricing";
import {
  HOLDING_RESERVATION_STATUSES,
  RESERVATION_LINES_SELECT,
  adjustReservedUnits,
  claimReservation,
  lockReservation,
  piecesForLines,
  reservationLines,
  syncReservationHeader,
  withDeadlockRetry,
  type ReservationLine,
} from "@/lib/reservation-counters";
import { recordReservationEvents, type ReservationEventInput } from "@/lib/reservation-events";
import { headerMirror } from "@/lib/reservation-header";
import { generateOrderNumber } from "@/lib/utils";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RESERVATION_DAYS = 60;
export const MAX_RESERVATION_QUANTITY = 999;
export const MAX_RESERVATION_ITEMS = 50;

export type ReservationListFilter = "activas" | "vencidas" | "convertidas" | "sin-respaldo" | "cerradas";

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  sku: true,
  isKit: true,
  stock: true,
  reservedUnits: true,
  images: { where: { isMain: true }, take: 1, select: { url: true } },
} satisfies Prisma.ProductSelect;

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
  product: { select: PRODUCT_CARD_SELECT },
  // Los ítems creados juntos comparten la hora: el nombre deja el orden estable.
  items: {
    orderBy: [{ createdAt: "asc" }, { product: { name: "asc" } }],
    select: { id: true, productId: true, quantity: true, unbackedAt: true, createdAt: true, product: { select: PRODUCT_CARD_SELECT } },
  },
  order: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.StockReservationSelect;

export type ReservationRow = Prisma.StockReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

function parseQuantity(value: unknown, { allowZero = false } = {}): number {
  const quantity = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(quantity) || quantity < min || quantity > MAX_RESERVATION_QUANTITY) {
    throw ErrorFactory.InvalidRequest(`La cantidad debe ser un número entero entre ${min} y ${MAX_RESERVATION_QUANTITY}`);
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

/**
 * Los productos de una reserva nueva: `items[]` o, como antes, un solo
 * `productId` con su `quantity`. El mismo producto dos veces se suma.
 */
export function parseReservationItems(input: { items?: unknown; productId?: unknown; quantity?: unknown }): ReservationLine[] {
  const raw = Array.isArray(input.items) ? input.items : input.productId !== undefined ? [{ productId: input.productId, quantity: input.quantity }] : [];
  if (raw.length === 0) throw ErrorFactory.InvalidRequest("Elige al menos un producto");
  const merged = new Map<string, number>();
  for (const entry of raw) {
    const productId = entry && typeof entry === "object" ? (entry as { productId?: unknown }).productId : undefined;
    if (typeof productId !== "string" || !productId) throw ErrorFactory.InvalidRequest("Elige el producto");
    merged.set(productId, (merged.get(productId) ?? 0) + parseQuantity((entry as { quantity?: unknown }).quantity));
  }
  if (merged.size > MAX_RESERVATION_ITEMS) throw ErrorFactory.InvalidRequest(`Una reserva puede tener hasta ${MAX_RESERVATION_ITEMS} productos`);
  return Array.from(merged, ([productId, quantity]) => ({ productId, quantity: parseQuantity(quantity) }));
}

async function assertReservable(tx: PrismaTx, storeId: string, productIds: string[]) {
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, storeId },
    select: { id: true, name: true, isArchived: true, isKit: true, kitComponents: { select: { componentId: true } } },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const id of productIds) {
    const product = byId.get(id);
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
    if (product.isArchived) throw ErrorFactory.InvalidRequest(`«${product.name}» está archivado y no se puede reservar`);
    if (product.isKit && product.kitComponents.length === 0) {
      throw ErrorFactory.InvalidRequest(`El kit «${product.name}» no tiene productos configurados`);
    }
  }
  return byId;
}

/** Sube el contador de las piezas; si el único producto es un kit, el 409 lo dice. */
async function holdLines(tx: PrismaTx, storeId: string, lines: ReservationLine[], names: Map<string, { name: string; isKit: boolean }>) {
  const pieces = await piecesForLines(tx, lines);
  return adjustReservedUnits(tx, storeId, pieces, "hold").catch((error: unknown) => {
    const only = lines.length === 1 ? names.get(lines[0].productId) : undefined;
    if (only?.isKit && error instanceof AppError && error.statusCode === 409) {
      throw new AppError(`No alcanza para reservar ${lines[0].quantity} × el kit «${only.name}»: ${error.message}`, 409, error.details);
    }
    throw error;
  });
}

async function freeLines(tx: PrismaTx, storeId: string, lines: ReservationLine[]) {
  return adjustReservedUnits(tx, storeId, await piecesForLines(tx, lines), "free");
}

export async function createReservation(input: {
  storeId: string;
  items?: unknown;
  productId?: unknown;
  quantity?: unknown;
  customerName: unknown;
  customerPhone?: unknown;
  note?: unknown;
  days?: unknown;
  createdBy: string;
  now?: Date;
}) {
  const lines = parseReservationItems(input);
  const customerName = parseName(input.customerName);
  const customerPhone = typeof input.customerPhone === "string" ? normalizePhone(input.customerPhone) : "";
  const note = parseNote(input.note);
  const store = await prismadb.store.findUnique({ where: { id: input.storeId }, select: { reservationDefaultDays: true } });
  if (!store) throw ErrorFactory.NotFound("Tienda no encontrada");
  const days = parseDays(input.days, store.reservationDefaultDays);
  const now = input.now ?? new Date();

  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    const products = await assertReservable(tx, input.storeId, lines.map((line) => line.productId));
    const affectedProductIds = await holdLines(tx, input.storeId, lines, products);
    const created = await tx.stockReservation.create({
      data: {
        storeId: input.storeId,
        ...headerMirror(lines),
        customerName,
        customerPhone,
        note,
        expiresAt: new Date(now.getTime() + days * DAY_MS),
        createdBy: input.createdBy,
      },
      select: { id: true },
    });
    await tx.stockReservationItem.createMany({
      data: lines.map((line) => ({ storeId: input.storeId, reservationId: created.id, productId: line.productId, quantity: line.quantity, addedBy: input.createdBy })),
    });
    await recordReservationEvents(tx, [
      { storeId: input.storeId, reservationId: created.id, kind: "created", actor: input.createdBy, detail: { items: lines.length, days } },
      ...lines.map((line) => ({ storeId: input.storeId, reservationId: created.id, kind: "item_added" as const, actor: input.createdBy, productId: line.productId, quantity: line.quantity, previousQuantity: 0 })),
    ]);
    const reservation = await tx.stockReservation.findUniqueOrThrow({ where: { id: created.id }, select: RESERVATION_SELECT });
    return { reservation, affectedProductIds: [...lines.map((line) => line.productId), ...affectedProductIds] };
  }));
}

/** Una reserva que se edita tiene que seguir ACTIVA; la convertida se edita desde su pedido. */
async function lockActive(tx: PrismaTx, storeId: string, id: string) {
  const hold = await lockReservation(tx, storeId, id);
  if (!hold) throw ErrorFactory.NotFound("Reserva no encontrada");
  if (hold.status === StockReservationStatus.CONVERTED) {
    const order = hold.orderId ? await tx.order.findUnique({ where: { id: hold.orderId }, select: { orderNumber: true } }) : null;
    const which = order ? `el pedido ${order.orderNumber}` : "un pedido";
    throw ErrorFactory.Conflict(`Esta reserva ya es ${which}: sus productos se editan desde el pedido.`);
  }
  if (hold.status !== StockReservationStatus.ACTIVE) throw ErrorFactory.Conflict("Esta reserva ya se cerró; no se puede editar");
  return hold;
}

/**
 * «Agregar a la reserva abierta»: uno o varios productos, o más unidades de
 * los que ya están, todo o nada (el 409 nombra cada producto que no alcanza).
 * El vencimiento no se mueve; para eso está «Extender».
 */
export async function addReservationItems(storeId: string, id: string, input: { items?: unknown; productId?: unknown; quantity?: unknown }, actor: string) {
  const lines = parseReservationItems(input);
  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    await lockActive(tx, storeId, id);
    const products = await assertReservable(tx, storeId, lines.map((line) => line.productId));
    const existing = new Map(
      (await tx.stockReservationItem.findMany({ where: { reservationId: id }, select: { id: true, productId: true, quantity: true } })).map((item) => [item.productId, item]),
    );
    const newProducts = lines.filter((line) => !existing.has(line.productId)).length;
    if (existing.size + newProducts > MAX_RESERVATION_ITEMS) throw ErrorFactory.InvalidRequest(`Una reserva puede tener hasta ${MAX_RESERVATION_ITEMS} productos`);
    for (const line of lines) {
      if ((existing.get(line.productId)?.quantity ?? 0) + line.quantity > MAX_RESERVATION_QUANTITY) {
        throw ErrorFactory.InvalidRequest(`Un producto puede tener hasta ${MAX_RESERVATION_QUANTITY} unidades en la reserva`);
      }
    }
    const affected = await holdLines(tx, storeId, lines, products);
    const events: ReservationEventInput[] = [];
    for (const line of lines) {
      const before = existing.get(line.productId);
      const total = (before?.quantity ?? 0) + line.quantity;
      if (before) await tx.stockReservationItem.update({ where: { id: before.id }, data: { quantity: total } });
      else await tx.stockReservationItem.create({ data: { storeId, reservationId: id, productId: line.productId, quantity: line.quantity, addedBy: actor } });
      events.push({ storeId, reservationId: id, kind: "item_added", actor, productId: line.productId, quantity: total, previousQuantity: before?.quantity ?? 0 });
    }
    await syncReservationHeader(tx, id);
    await recordReservationEvents(tx, events);
    const reservation = await tx.stockReservation.findUniqueOrThrow({ where: { id }, select: RESERVATION_SELECT });
    return { reservation, released: false, affectedProductIds: [...lines.map((line) => line.productId), ...affected] };
  }));
}

/** Un solo producto: lo mismo que `addReservationItems`. */
export function addReservationItem(storeId: string, id: string, input: { productId: unknown; quantity: unknown }, actor: string) {
  return addReservationItems(storeId, id, { productId: input.productId ?? "", quantity: input.quantity }, actor);
}

/** Cambia la cantidad de un ítem; 0 lo quita. Quitar el último libera la reserva. */
export async function setReservationItemQuantity(storeId: string, id: string, input: { itemId: unknown; quantity: unknown }, actor: string) {
  if (typeof input.itemId !== "string" || !input.itemId) throw ErrorFactory.InvalidRequest("Elige el producto de la reserva");
  const itemId = input.itemId;
  const quantity = parseQuantity(input.quantity, { allowZero: true });
  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    await lockActive(tx, storeId, id);
    const item = await tx.stockReservationItem.findFirst({
      where: { id: itemId, reservationId: id, storeId },
      select: { id: true, productId: true, quantity: true, product: { select: { name: true, isKit: true } } },
    });
    if (!item) throw ErrorFactory.NotFound("Ese producto ya no está en la reserva");
    const diff = quantity - item.quantity;
    let affected: string[] = [];
    if (diff > 0) {
      affected = await holdLines(tx, storeId, [{ productId: item.productId, quantity: diff }], new Map([[item.productId, item.product]]));
    } else if (diff < 0) {
      affected = await freeLines(tx, storeId, [{ productId: item.productId, quantity: -diff }]);
    }
    if (quantity === 0) await tx.stockReservationItem.delete({ where: { id: item.id } });
    else if (diff !== 0) await tx.stockReservationItem.update({ where: { id: item.id }, data: { quantity } });

    const events: ReservationEventInput[] = [];
    if (diff !== 0) {
      events.push({ storeId, reservationId: id, kind: quantity === 0 ? "item_removed" : "item_quantity", actor, productId: item.productId, quantity, previousQuantity: item.quantity });
    }
    const remaining = await syncReservationHeader(tx, id);
    let released = false;
    if (remaining.length === 0) {
      released = await claimReservation(tx, { id, storeId, from: [StockReservationStatus.ACTIVE], to: StockReservationStatus.RELEASED, closedBy: actor });
      if (released) events.push({ storeId, reservationId: id, kind: "released", actor, detail: { reason: "sin_productos" } });
    }
    await recordReservationEvents(tx, events);
    const reservation = await tx.stockReservation.findUniqueOrThrow({ where: { id }, select: RESERVATION_SELECT });
    return { reservation, released, affectedProductIds: [item.productId, ...affected] };
  }));
}

/** Nombre, celular o nota de la clienta. El historial anota qué cambió, nunca los datos. */
export async function editReservationCustomer(storeId: string, id: string, input: { customerName?: unknown; customerPhone?: unknown; note?: unknown }, actor: string) {
  const data: Prisma.StockReservationUpdateInput = {};
  if (input.customerName !== undefined) data.customerName = parseName(input.customerName);
  if (input.customerPhone !== undefined) data.customerPhone = typeof input.customerPhone === "string" ? normalizePhone(input.customerPhone) : "";
  if (input.note !== undefined) data.note = parseNote(input.note);
  const fields = Object.keys(data);
  if (fields.length === 0) throw ErrorFactory.InvalidRequest("No hay nada que cambiar");
  return prismadb.$transaction(async (tx) => {
    await lockActive(tx, storeId, id);
    await tx.stockReservation.update({ where: { id }, data });
    await recordReservationEvents(tx, [{ storeId, reservationId: id, kind: "customer_edited", actor, detail: { fields } }]);
    return tx.stockReservation.findUniqueOrThrow({ where: { id }, select: RESERVATION_SELECT });
  });
}

async function closeOne(
  storeId: string,
  id: string,
  from: StockReservationStatus[],
  to: StockReservationStatus,
  closedBy: string,
) {
  return withDeadlockRetry(() => prismadb.$transaction(async (tx) => {
    const found = await tx.stockReservation.findFirst({ where: { id, storeId }, select: { id: true, status: true, ...RESERVATION_LINES_SELECT } });
    if (!found) throw ErrorFactory.NotFound("Reserva no encontrada");
    const claimed = await claimReservation(tx, { id, storeId, from, to, closedBy });
    if (!claimed) return { changed: false as const, affectedProductIds: [] as string[] };
    const lines = reservationLines(found);
    const affected = await freeLines(tx, storeId, lines);
    await recordReservationEvents(tx, [
      { storeId, reservationId: id, kind: to === StockReservationStatus.EXPIRED ? "expired" : "released", actor: closedBy },
    ]);
    return { changed: true as const, affectedProductIds: [...lines.map((line) => line.productId), ...affected] };
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
export async function extendReservation(storeId: string, id: string, daysInput: unknown, actor: string | null = null, now = new Date()) {
  const days = parseDays(daysInput, 1);
  return prismadb.$transaction(async (tx) => {
    const hold = await tx.stockReservation.findFirst({ where: { id, storeId }, select: { expiresAt: true } });
    if (!hold) throw ErrorFactory.NotFound("Reserva no encontrada");
    const base = Math.max(hold.expiresAt.getTime(), now.getTime());
    const expiresAt = new Date(base + days * DAY_MS);
    const affected = await tx.$executeRaw`
      UPDATE \`StockReservation\`
         SET \`expiresAt\` = ${expiresAt}, \`updatedAt\` = NOW(3)
       WHERE \`id\` = ${id} AND \`storeId\` = ${storeId}
         AND \`status\` IN (${Prisma.join(HOLDING_RESERVATION_STATUSES)})`;
    if (affected !== 1) throw ErrorFactory.Conflict("Esta reserva ya se cerró; no se puede extender");
    await recordReservationEvents(tx, [
      { storeId, reservationId: id, kind: "extended", actor, detail: { days, from: hold.expiresAt.toISOString(), to: expiresAt.toISOString() } },
    ]);
    return tx.stockReservation.findFirstOrThrow({ where: { id, storeId }, select: RESERVATION_SELECT });
  });
}

const CONVERT_SELECT = { id: true, status: true, orderId: true, customerName: true, customerPhone: true, note: true, ...RESERVATION_LINES_SELECT } as const;

/** Las líneas del pedido al precio efectivo de hoy (el mismo cálculo que «Convertir»). */
async function priceReservation(storeId: string, lines: ReservationLine[]) {
  const products = await prismadb.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) }, storeId },
    select: { id: true, name: true, sku: true, price: true, categoryId: true, productGroupId: true, images: { orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } } },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  if (lines.some((line) => !byId.has(line.productId))) throw ErrorFactory.Conflict("Un producto de la reserva ya no existe; quítalo antes de convertir");
  const priced = await priceLines(storeId, lines, products);
  const orderLines = lines.map((line) => {
    const product = byId.get(line.productId)!;
    const unitPrice = Math.round(priced.get(product.id)?.unitPrice ?? product.price);
    return { productId: product.id, quantity: line.quantity, name: product.name, sku: product.sku, price: unitPrice, imageUrl: product.images[0]?.url ?? "" };
  });
  const totals = calculateOrderTotals(orderLines.map((line) => ({ product: { price: line.price }, quantity: line.quantity })));
  return { orderLines, totals };
}

/** Lo que «Convertir en pedido» crearía, sin crear nada: para confirmar antes. */
export async function previewConversion(storeId: string, id: string) {
  const found = await prismadb.stockReservation.findFirst({ where: { id, storeId }, select: CONVERT_SELECT });
  if (!found) throw ErrorFactory.NotFound("Reserva no encontrada");
  if (found.status !== StockReservationStatus.ACTIVE) throw ErrorFactory.Conflict("Solo una reserva activa se puede convertir en pedido");
  const { orderLines, totals } = await priceReservation(storeId, reservationLines(found));
  return {
    lines: orderLines.map((line) => ({ productId: line.productId, name: line.name, quantity: line.quantity, unitPrice: line.price, total: line.price * line.quantity })),
    subtotal: totals.subtotal,
    total: totals.total,
    payment: "Transferencia (se cambia en el pedido)",
  };
}

/**
 * «Convertir en pedido»: UN pedido PENDIENTE del panel con la clienta y una
 * línea por producto al precio de hoy. La reserva sigue guardando las
 * unidades hasta que el pedido se pague (la venta las consume) o se cancele
 * (se liberan). El pago queda como transferencia por defecto.
 */
export async function convertReservation(storeId: string, id: string, createdBy: string) {
  const found = await prismadb.stockReservation.findFirst({ where: { id, storeId }, select: CONVERT_SELECT });
  if (!found) throw ErrorFactory.NotFound("Reserva no encontrada");
  if (found.status === StockReservationStatus.CONVERTED && found.orderId) return { orderId: found.orderId, existing: true };
  if (found.status !== StockReservationStatus.ACTIVE) throw ErrorFactory.Conflict("Solo una reserva activa se puede convertir en pedido");
  const { orderLines, totals } = await priceReservation(storeId, reservationLines(found));

  return prismadb.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        storeId,
        orderNumber: generateOrderNumber(),
        type: OrderType.STANDARD,
        status: OrderStatus.PENDING,
        source: OrderSource.PANEL,
        createdBy,
        fullName: found.customerName,
        phone: found.customerPhone,
        subtotal: totals.subtotal,
        total: totals.total,
        internalNotes: [`Pedido creado desde una reserva de ${found.customerName}.`, found.note].filter(Boolean).join(" "),
        orderItems: { create: orderLines },
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
    await recordReservationEvents(tx, [{ storeId, reservationId: id, kind: "converted", actor: createdBy, detail: { orderId: order.id, lines: orderLines.length } }]);
    return { orderId: order.id, existing: false };
  });
}

/**
 * Un pedido PENDIENTE que salió de una reserva es el único lugar donde se
 * editan sus productos: al guardarlo, la reserva sigue a sus líneas en la
 * misma transacción. Lo que sube se aparta con la guarda de siempre (409 si
 * no alcanza), lo que baja se libera, y un pedido sin productos libera la
 * reserva. Devuelve los productos afectados para la purga de la tienda.
 */
export async function syncConvertedReservation(
  tx: PrismaTx,
  input: { storeId: string; orderId: string; lines: { productId: string | null; quantity: number }[]; actor: string | null },
): Promise<string[]> {
  const hold = await tx.stockReservation.findFirst({
    where: { storeId: input.storeId, orderId: input.orderId, status: StockReservationStatus.CONVERTED },
    select: { id: true },
  });
  if (!hold) return [];
  const locked = await lockReservation(tx, input.storeId, hold.id);
  if (!locked || locked.status !== StockReservationStatus.CONVERTED) return [];

  const target = new Map<string, number>();
  for (const line of input.lines) {
    if (line.productId && line.quantity > 0) target.set(line.productId, (target.get(line.productId) ?? 0) + line.quantity);
  }
  const items = await tx.stockReservationItem.findMany({ where: { reservationId: hold.id }, select: { id: true, productId: true, quantity: true } });
  const current = new Map(items.map((item) => [item.productId, item]));

  const more: ReservationLine[] = [];
  const less: ReservationLine[] = [];
  const events: ReservationEventInput[] = [];
  const productIds = new Set<string>([...Array.from(target.keys()), ...Array.from(current.keys())]);
  for (const productId of Array.from(productIds)) {
    const before = current.get(productId)?.quantity ?? 0;
    const after = target.get(productId) ?? 0;
    if (after === before) continue;
    if (after > before) more.push({ productId, quantity: after - before });
    else less.push({ productId, quantity: before - after });
    const kind = before === 0 ? "item_added" : after === 0 ? "item_removed" : "item_quantity";
    events.push({ storeId: input.storeId, reservationId: hold.id, kind, actor: input.actor, productId, quantity: after, previousQuantity: before, detail: { via: "pedido", orderId: input.orderId } });
  }
  if (events.length === 0) return [];

  const affected: string[] = [];
  if (more.length > 0) {
    const names = new Map((await tx.product.findMany({ where: { id: { in: more.map((line) => line.productId) } }, select: { id: true, name: true, isKit: true } })).map((product) => [product.id, product]));
    affected.push(...(await holdLines(tx, input.storeId, more, names)));
  }
  if (less.length > 0) affected.push(...(await freeLines(tx, input.storeId, less)));

  for (const productId of Array.from(productIds)) {
    const existing = current.get(productId);
    const after = target.get(productId) ?? 0;
    if (existing && after === 0) await tx.stockReservationItem.delete({ where: { id: existing.id } });
    else if (existing && after !== existing.quantity) await tx.stockReservationItem.update({ where: { id: existing.id }, data: { quantity: after } });
    else if (!existing && after > 0) {
      await tx.stockReservationItem.create({ data: { storeId: input.storeId, reservationId: hold.id, productId, quantity: after, addedBy: input.actor } });
    }
  }
  const remaining = await syncReservationHeader(tx, hold.id);
  if (remaining.length === 0) {
    const released = await claimReservation(tx, { id: hold.id, storeId: input.storeId, from: [StockReservationStatus.CONVERTED], to: StockReservationStatus.RELEASED, closedBy: input.actor });
    if (released) events.push({ storeId: input.storeId, reservationId: hold.id, kind: "released", actor: input.actor, detail: { reason: "pedido_sin_productos", orderId: input.orderId } });
  }
  await recordReservationEvents(tx, events);
  return Array.from(new Set([...Array.from(productIds), ...affected]));
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

/**
 * Las reservas ACTIVAS de una clienta, por su celular normalizado (el mismo
 * que guarda `createReservation`). El nombre no sirve de llave: se repite.
 */
export async function findOpenReservationsByPhone(storeId: string, phone: unknown) {
  const normalized = typeof phone === "string" ? normalizePhone(phone) : "";
  if (!normalized) return [];
  return prismadb.stockReservation.findMany({
    where: { storeId, status: StockReservationStatus.ACTIVE, customerPhone: normalized },
    select: RESERVATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

/** Una reserva con su historial, lo más reciente primero. */
export async function getReservationDetail(storeId: string, id: string) {
  const reservation = await prismadb.stockReservation.findFirst({ where: { id, storeId }, select: RESERVATION_SELECT });
  if (!reservation) throw ErrorFactory.NotFound("Reserva no encontrada");
  const events = await prismadb.stockReservationEvent.findMany({
    where: { reservationId: id, storeId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, kind: true, productId: true, quantity: true, previousQuantity: true, actor: true, detail: true, createdAt: true },
  });
  // Un producto que se quitó ya no está en los ítems: el historial necesita su nombre igual.
  const productIds = Array.from(new Set(events.flatMap((event) => (event.productId ? [event.productId] : []))));
  const names = productIds.length
    ? await prismadb.product.findMany({ where: { id: { in: productIds }, storeId }, select: { id: true, name: true } })
    : [];
  return { reservation, events, productNames: Object.fromEntries(names.map((row) => [row.id, row.name])) };
}

export const isReservationFilter = (value: string | null): value is ReservationListFilter =>
  value === "activas" || value === "vencidas" || value === "convertidas" || value === "sin-respaldo" || value === "cerradas";
