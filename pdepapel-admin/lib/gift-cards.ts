import {
  GiftCardMovementType,
  GiftCardReview,
  GiftCardStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  Prisma,
  type GiftCard,
  type PrismaClient,
} from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import {
  generateGiftCardCode,
  giftCardCodeLast4,
  hashGiftCardCode,
  normalizeGiftCardCode,
} from "@/lib/gift-card-codes";
import { isFraudCancelled, needsGiftCardReview } from "@/lib/order-risk";
import { round2 } from "@/lib/order-totals";
import { getAmountDue } from "@/lib/gift-card-amounts";

/**
 * Tarjetas de regalo: el libro de saldo y sus reglas.
 *
 * Una tarjeta nace cuando el pedido que la compró (tipo GIFT_CARD) queda
 * pagado. Su saldo es una CACHÉ del libro (`GiftCardMovement`): ninguna ruta
 * suma o resta `balance` a mano; todo pasa por `applyGiftCardMovement`, que
 * bloquea la fila (SELECT … FOR UPDATE, como `lockFairEvent`), comprueba que
 * el saldo alcance con un UPDATE condicional y deja el movimiento con el
 * saldo resultante. La clave de idempotencia por hecho hace que un webhook
 * repetido no escriba dos veces.
 *
 * El código en claro nunca se guarda: solo su hash y los últimos cuatro.
 * Se conoce una sola vez, al emitir o reemitir, y en ese momento se manda
 * por correo (`deliverGiftCard`), después de que la transacción confirmó.
 */

export type GiftCardTx = Prisma.TransactionClient;
type Db = GiftCardTx | PrismaClient;

export const GIFT_CARD_LINE_NAME = "Tarjeta de regalo";
export const DEFAULT_GIFT_CARD_DENOMINATIONS = [50000, 100000, 200000] as const;
export const GIFT_CARD_MIN_AMOUNT = 10000;
export const GIFT_CARD_MAX_AMOUNT = 2000000;

/** Etiquetas del libro, para el panel. */
export const GIFT_CARD_MOVEMENT_LABELS: Record<GiftCardMovementType, string> = {
  ISSUED: "Emitida",
  HELD: "Reservada por un pedido",
  REDEEMED: "Usada",
  RELEASED: "Reserva liberada",
  REVERSED: "Devuelta al saldo",
  VOIDED: "Anulada",
  REISSUED: "Código nuevo",
};

export const GIFT_CARD_STATUS_LABELS: Record<GiftCardStatus, string> = {
  ACTIVE: "Activa",
  VOID: "Anulada",
};

/* ------------------------------------------------------------- montos */

export { getAmountDue, isGiftCardOrder } from "@/lib/gift-card-amounts";

/* ------------------------------------------------------- denominaciones */

/**
 * Los valores a la venta. Sin filas configuradas se ofrecen los tres por
 * defecto, sin escribir nada: la tienda es un GET.
 */
export async function getActiveDenominations(db: Db, storeId: string): Promise<number[]> {
  const rows = await db.giftCardDenomination.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { amount: "asc" }],
    select: { amount: true, isActive: true },
  });
  if (rows.length === 0) return [...DEFAULT_GIFT_CARD_DENOMINATIONS];
  return rows.filter((row) => row.isActive).map((row) => row.amount);
}

/** El valor pedido es uno de los que están a la venta. */
export async function assertSellableDenomination(db: Db, storeId: string, amount: number) {
  const active = await getActiveDenominations(db, storeId);
  if (!active.includes(amount)) {
    throw ErrorFactory.InvalidRequest(
      "Ese valor de tarjeta no está a la venta. Elige uno de la lista.",
    );
  }
}

export function parseDenominationAmount(value: unknown): number {
  const amount = typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : Number(value);
  if (!Number.isInteger(amount) || amount < GIFT_CARD_MIN_AMOUNT || amount > GIFT_CARD_MAX_AMOUNT) {
    throw ErrorFactory.InvalidRequest(
      `El valor debe ser un entero entre ${GIFT_CARD_MIN_AMOUNT.toLocaleString("es-CO")} y ${GIFT_CARD_MAX_AMOUNT.toLocaleString("es-CO")} pesos`,
    );
  }
  return amount;
}

/* ---------------------------------------------------------------- libro */

export interface GiftCardMovementInput {
  storeId: string;
  giftCardId: string;
  type: GiftCardMovementType;
  /** Con signo. 0 para las marcas (REDEEMED, VOIDED por reemisión, REISSUED). */
  amount: number;
  orderId?: string | null;
  reason?: string | null;
  createdBy?: string | null;
  /** Una por hecho: `issue:<orderId>`, `hold:<orderId>`, … */
  idempotencyKey: string;
  /** Solo la anulación puede dejar el saldo en cero desde cualquier valor. */
  allowVoid?: boolean;
}

/**
 * Bloquea la tarjeta para el resto de la transacción. Igual que
 * `lockFairEvent`: quien llega segundo espera a que el primero confirme.
 */
export async function lockGiftCard(tx: GiftCardTx, storeId: string, giftCardId: string) {
  const rows = await tx.$queryRaw<{ id: string; balance: number; status: GiftCardStatus }[]>`
    SELECT \`id\`, \`balance\`, \`status\` FROM \`GiftCard\`
     WHERE \`id\` = ${giftCardId} AND \`storeId\` = ${storeId}
     FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * La única forma de mover saldo. Devuelve el movimiento escrito, o el que
 * ya existía con esa clave (segunda entrega del mismo webhook).
 */
export async function applyGiftCardMovement(tx: GiftCardTx, input: GiftCardMovementInput) {
  const existing = await tx.giftCardMovement.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { movement: existing, applied: false as const };

  const locked = await lockGiftCard(tx, input.storeId, input.giftCardId);
  if (!locked) throw ErrorFactory.NotFound("La tarjeta de regalo no existe");
  if (locked.status !== GiftCardStatus.ACTIVE && !input.allowVoid) {
    throw ErrorFactory.Conflict("Esta tarjeta de regalo está anulada");
  }

  const delta = round2(input.amount);
  const balanceAfter = round2(Number(locked.balance) + delta);
  if (balanceAfter < 0) {
    throw ErrorFactory.Conflict(
      `El saldo de la tarjeta (${Math.round(locked.balance).toLocaleString("es-CO")}) no alcanza`,
    );
  }

  if (delta !== 0) {
    // Guarda atómica además del bloqueo: si otra transacción se coló, la
    // condición falla y nada se escribe.
    const updated = await tx.$executeRaw`
      UPDATE \`GiftCard\`
         SET \`balance\` = \`balance\` + ${delta}, \`updatedAt\` = NOW(3)
       WHERE \`id\` = ${input.giftCardId}
         AND \`storeId\` = ${input.storeId}
         AND \`balance\` + ${delta} >= 0`;
    if (updated !== 1) {
      throw ErrorFactory.Conflict("El saldo de la tarjeta cambió mientras se usaba. Intenta de nuevo.");
    }
  }

  const movement = await tx.giftCardMovement.create({
    data: {
      storeId: input.storeId,
      giftCardId: input.giftCardId,
      orderId: input.orderId ?? null,
      type: input.type,
      amount: delta,
      balanceAfter,
      reason: input.reason ?? null,
      createdBy: input.createdBy ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return { movement, applied: true as const };
}

/** Suma del libro, para comprobar la caché (pruebas y auditoría). */
export async function sumGiftCardLedger(db: Db, giftCardId: string): Promise<number> {
  const result = await db.giftCardMovement.aggregate({
    where: { giftCardId },
    _sum: { amount: true },
  });
  return round2(Number(result._sum.amount ?? 0));
}

/* -------------------------------------------------------------- emisión */

export interface IssuedGiftCard {
  card: GiftCard;
  /** Solo cuando se acaba de emitir o reemitir; `null` si ya existía. */
  code: string | null;
  /** A quién se manda el código. */
  deliverTo: string | null;
}

/**
 * Emite la tarjeta del pedido GIFT_CARD que acaba de quedar pagado. Corre
 * DENTRO de la transacción que marca el pago; el correo con el código va
 * después de confirmar (`deliverGiftCard`). Idempotente: una compra emite
 * una sola tarjeta, aunque el webhook llegue dos veces. Devuelve `null` si
 * el pedido no es de tarjeta.
 */
export async function issueGiftCardForOrder(
  tx: GiftCardTx,
  input: { storeId: string; orderId: string; createdBy?: string | null },
): Promise<IssuedGiftCard | null> {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    select: {
      id: true,
      type: true,
      total: true,
      email: true,
      phone: true,
      source: true,
      createdBy: true,
      riskScore: true,
      riskReasons: true,
      giftCardReview: true,
      giftRecipientName: true,
      giftRecipientEmail: true,
      giftMessage: true,
    },
  });
  if (!order || order.type !== OrderType.GIFT_CARD) return null;

  const existing = await tx.giftCard.findUnique({ where: { purchaseOrderId: order.id } });
  const deliverTo = (order.giftRecipientEmail || order.email || "").trim().toLowerCase() || null;
  if (existing) return { card: existing, code: null, deliverTo };

  if (isFraudCancelled(order)) return null;
  if (order.giftCardReview === GiftCardReview.PENDING || order.giftCardReview === GiftCardReview.REJECTED) return null;
  if (!order.giftCardReview && order.source !== OrderSource.PANEL && !order.createdBy) {
    const priorPaid = await tx.order.count({
      where: {
        storeId: input.storeId,
        id: { not: order.id },
        paidAt: { not: null },
        OR: [
          ...(order.email ? [{ email: order.email }] : []),
          ...(order.phone ? [{ phone: order.phone }] : []),
        ],
      },
    });
    if (needsGiftCardReview({ riskScore: order.riskScore, total: Number(order.total), isFirstPurchase: priorPaid === 0 })) {
      await tx.order.update({ where: { id: order.id }, data: { giftCardReview: GiftCardReview.PENDING } });
      return null;
    }
  }

  const code = generateGiftCardCode();
  const canonical = normalizeGiftCardCode(code) as string;
  const amount = round2(Number(order.total));
  const card = await tx.giftCard.create({
    data: {
      storeId: input.storeId,
      codeHash: hashGiftCardCode(canonical),
      codeLast4: giftCardCodeLast4(canonical),
      initialAmount: amount,
      // El saldo lo pone el movimiento ISSUED: la caché nunca se escribe a mano.
      balance: 0,
      status: GiftCardStatus.ACTIVE,
      purchaseOrderId: order.id,
      buyerEmail: order.email || null,
      recipientName: order.giftRecipientName || null,
      recipientEmail: order.giftRecipientEmail || null,
      message: order.giftMessage || null,
    },
  });
  await applyGiftCardMovement(tx, {
    storeId: input.storeId,
    giftCardId: card.id,
    type: GiftCardMovementType.ISSUED,
    amount,
    orderId: order.id,
    reason: "Compra pagada",
    createdBy: input.createdBy ?? null,
    idempotencyKey: `issue:${order.id}`,
  });
  return { card: { ...card, balance: amount }, code, deliverTo };
}

/**
 * Código nuevo para el mismo saldo. Anula el anterior en la misma
 * transacción: desde ese instante el viejo no valida. El panel nunca ve el
 * código: sale por correo a quien la recibe (o a quien la compró).
 */
export async function reissueGiftCard(
  db: PrismaClient,
  input: { storeId: string; giftCardId: string; createdBy?: string | null },
): Promise<IssuedGiftCard> {
  return db.$transaction(async (tx) => {
    const locked = await lockGiftCard(tx, input.storeId, input.giftCardId);
    if (!locked) throw ErrorFactory.NotFound("La tarjeta de regalo no existe");
    if (locked.status !== GiftCardStatus.ACTIVE) {
      throw ErrorFactory.Conflict("Una tarjeta anulada no se puede reemitir");
    }
    const current = await tx.giftCard.findUniqueOrThrow({ where: { id: input.giftCardId } });
    const code = generateGiftCardCode();
    const canonical = normalizeGiftCardCode(code) as string;
    const stamp = Date.now();
    await applyGiftCardMovement(tx, {
      storeId: input.storeId,
      giftCardId: current.id,
      type: GiftCardMovementType.VOIDED,
      amount: 0,
      reason: `Código anterior (termina en ${current.codeLast4}) anulado por reemisión`,
      createdBy: input.createdBy ?? null,
      idempotencyKey: `reissue-void:${current.id}:${stamp}`,
    });
    const card = await tx.giftCard.update({
      where: { id: current.id },
      data: {
        codeHash: hashGiftCardCode(canonical),
        codeLast4: giftCardCodeLast4(canonical),
      },
    });
    await applyGiftCardMovement(tx, {
      storeId: input.storeId,
      giftCardId: current.id,
      type: GiftCardMovementType.REISSUED,
      amount: 0,
      reason: `Código nuevo (termina en ${card.codeLast4})`,
      createdBy: input.createdBy ?? null,
      idempotencyKey: `reissue-new:${current.id}:${stamp}`,
    });
    const deliverTo = (card.recipientEmail || card.buyerEmail || "").trim().toLowerCase() || null;
    return { card, code, deliverTo };
  });
}

/* --------------------------------------------------------- estado pedido */

/** Un pedido GIFT_CARD está «entregado» cuando salió el correo con el código. */
export function isGiftCardDelivered(card: Pick<GiftCard, "deliveredAt"> | null | undefined) {
  return Boolean(card?.deliveredAt);
}

/** Estados en los que una tarjeta puede seguir usándose. */
export function isGiftCardUsable(card: Pick<GiftCard, "status" | "balance" | "expiresAt">, now = new Date()) {
  if (card.status !== GiftCardStatus.ACTIVE) return false;
  if (card.expiresAt && card.expiresAt.getTime() < now.getTime()) return false;
  return Number(card.balance) > 0;
}

export const GIFT_CARD_PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];

/* ------------------------------------------------------------- redención */

/** La tarjeta que corresponde a un código escrito por la clienta, o `null`. */
export async function findGiftCardByCode(db: Db, storeId: string, input: string | null | undefined) {
  const canonical = normalizeGiftCardCode(input);
  if (!canonical) return null;
  return db.giftCard.findFirst({
    where: { storeId, codeHash: hashGiftCardCode(canonical) },
  });
}

/** Cuánto puede cubrir la tarjeta de un total: el saldo o el total, lo menor. */
export function coverableAmount(balance: number, total: number): number {
  return Math.max(0, round2(Math.min(Number(balance), Number(total))));
}

type RedemptionOrder = {
  id: string;
  storeId: string;
  giftCardId: string | null;
  giftCardAmount: number;
  type?: OrderType | null;
};

/**
 * Reserva el saldo para un pedido que acaba de crearse (HELD). Corre en la
 * misma transacción que crea el pedido, con la fila bloqueada: dos pagos a
 * la vez con una sola tarjeta no se reparten un saldo que no existe.
 */
export async function holdGiftCardForOrder(
  tx: GiftCardTx,
  input: { storeId: string; giftCardId: string; orderId: string; amount: number; createdBy?: string | null },
) {
  return applyGiftCardMovement(tx, {
    storeId: input.storeId,
    giftCardId: input.giftCardId,
    type: GiftCardMovementType.HELD,
    amount: -round2(input.amount),
    orderId: input.orderId,
    reason: "Reservado por el pedido",
    createdBy: input.createdBy ?? null,
    idempotencyKey: `hold:${input.orderId}`,
  });
}

async function hasMovement(tx: GiftCardTx, key: string) {
  return Boolean(await tx.giftCardMovement.findUnique({ where: { idempotencyKey: key }, select: { id: true } }));
}

/**
 * El pedido que usó la tarjeta quedó pagado: la reserva se vuelve consumo.
 * Idempotente por pedido. Si la reserva se había liberado (pedido viejo
 * que se pagó tarde por transferencia), se vuelve a reservar si el saldo
 * alcanza; si no, se rechaza con un mensaje para el panel.
 */
export async function redeemGiftCardForOrder(
  tx: GiftCardTx,
  order: RedemptionOrder,
  createdBy?: string | null,
) {
  if (!order.giftCardId || !(order.giftCardAmount > 0)) return null;
  if (await hasMovement(tx, `redeem:${order.id}`)) return null;

  const heldStillOpen =
    (await hasMovement(tx, `hold:${order.id}`)) && !(await hasMovement(tx, `release:${order.id}`));
  if (!heldStillOpen) {
    // Reserva liberada por el tiempo: se toma otra vez (misma guarda de saldo).
    const reholds = await tx.giftCardMovement.count({
      where: { orderId: order.id, type: GiftCardMovementType.HELD },
    });
    try {
      await applyGiftCardMovement(tx, {
        storeId: order.storeId,
        giftCardId: order.giftCardId,
        type: GiftCardMovementType.HELD,
        amount: -round2(order.giftCardAmount),
        orderId: order.id,
        reason: "Reservado de nuevo al confirmar el pago",
        createdBy: createdBy ?? null,
        idempotencyKey: `rehold:${order.id}:${reholds}`,
      });
    } catch (error) {
      throw ErrorFactory.Conflict(
        `La tarjeta de regalo ya no tiene saldo para cubrir ${Math.round(order.giftCardAmount).toLocaleString("es-CO")} de este pedido: la reserva venció y el saldo se usó en otra compra. Cobra la diferencia o cancela el pedido.`,
      );
    }
  }
  return applyGiftCardMovement(tx, {
    storeId: order.storeId,
    giftCardId: order.giftCardId,
    type: GiftCardMovementType.REDEEMED,
    amount: 0,
    orderId: order.id,
    reason: `Usada por ${Math.round(order.giftCardAmount).toLocaleString("es-CO")}`,
    createdBy: createdBy ?? null,
    idempotencyKey: `redeem:${order.id}`,
  });
}

/**
 * El pedido que usó la tarjeta se canceló o se devolvió. Si ya estaba
 * pagado, el saldo vuelve (REVERSED); si solo estaba reservado, la reserva
 * se libera (RELEASED). Idempotente por pedido.
 */
export async function releaseOrReverseGiftCardForOrder(
  tx: GiftCardTx,
  order: RedemptionOrder,
  input: { createdBy?: string | null; reason?: string | null } = {},
) {
  if (!order.giftCardId || !(order.giftCardAmount > 0)) return null;
  const redeemed = await hasMovement(tx, `redeem:${order.id}`);
  if (redeemed) {
    if (await hasMovement(tx, `reverse:${order.id}`)) return null;
    return applyGiftCardMovement(tx, {
      storeId: order.storeId,
      giftCardId: order.giftCardId,
      type: GiftCardMovementType.REVERSED,
      amount: round2(order.giftCardAmount),
      orderId: order.id,
      reason: input.reason ?? "Pedido cancelado o devuelto",
      createdBy: input.createdBy ?? null,
      idempotencyKey: `reverse:${order.id}`,
    });
  }
  const held =
    (await hasMovement(tx, `hold:${order.id}`)) ||
    (await tx.giftCardMovement.count({ where: { orderId: order.id, type: GiftCardMovementType.HELD } })) > 0;
  if (!held || (await hasMovement(tx, `release:${order.id}`))) return null;
  return applyGiftCardMovement(tx, {
    storeId: order.storeId,
    giftCardId: order.giftCardId,
    type: GiftCardMovementType.RELEASED,
    amount: round2(order.giftCardAmount),
    orderId: order.id,
    reason: input.reason ?? "Pedido cancelado sin pagar",
    createdBy: input.createdBy ?? null,
    idempotencyKey: `release:${order.id}`,
  });
}

/**
 * Se cancela el pedido que COMPRÓ la tarjeta. Si nadie la ha usado, se
 * anula (saldo a cero). Si ya se usó, no se puede: ese dinero lo gastó
 * otra persona; la diferencia se devuelve por fuera del sistema.
 */
export async function voidGiftCardForPurchaseOrder(
  tx: GiftCardTx,
  input: { storeId: string; orderId: string; createdBy?: string | null },
) {
  const card = await tx.giftCard.findFirst({
    where: { purchaseOrderId: input.orderId, storeId: input.storeId },
  });
  if (!card) return null;
  if (card.status === GiftCardStatus.VOID) return card;
  const used = await tx.giftCardMovement.count({
    where: { giftCardId: card.id, type: { in: [GiftCardMovementType.HELD, GiftCardMovementType.REDEEMED] } },
  });
  if (used > 0) {
    const spent = round2(Number(card.initialAmount) - Number(card.balance));
    throw ErrorFactory.Conflict(
      `La tarjeta ya se usó por ${Math.round(spent).toLocaleString("es-CO")}: reembolsa la diferencia por fuera del sistema.`,
    );
  }
  await applyGiftCardMovement(tx, {
    storeId: input.storeId,
    giftCardId: card.id,
    type: GiftCardMovementType.VOIDED,
    amount: -round2(Number(card.balance)),
    orderId: input.orderId,
    reason: "Compra cancelada",
    createdBy: input.createdBy ?? null,
    idempotencyKey: `void:${input.orderId}`,
    allowVoid: true,
  });
  return tx.giftCard.update({ where: { id: card.id }, data: { status: GiftCardStatus.VOID } });
}

/**
 * Un pedido que se cancela, se elimina o se devuelve: libera o devuelve
 * el saldo que usó y, si compró una tarjeta, la anula (o se niega si ya se
 * usó). Es la única entrada que llaman los seis caminos de cancelación.
 */
export async function handleGiftCardOnOrderCancellation(
  tx: GiftCardTx,
  input: { storeId: string; orderId: string; createdBy?: string | null; reason?: string | null },
) {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    select: { id: true, storeId: true, type: true, giftCardId: true, giftCardAmount: true },
  });
  if (!order) return;
  await releaseOrReverseGiftCardForOrder(tx, order, { createdBy: input.createdBy, reason: input.reason });
  if (order.type === OrderType.GIFT_CARD) {
    await voidGiftCardForPurchaseOrder(tx, { storeId: input.storeId, orderId: order.id, createdBy: input.createdBy });
  }
}

/**
 * Un pedido que emitió una tarjeta no se elimina: la tarjeta lo referencia
 * y su libro también. Se cancela, y si nadie la usó la anulación va sola.
 */
export async function assertGiftCardPurchaseDeletable(tx: GiftCardTx, storeId: string, orderId: string) {
  const card = await tx.giftCard.findFirst({ where: { purchaseOrderId: orderId, storeId }, select: { id: true } });
  if (card) {
    throw ErrorFactory.Conflict(
      "Este pedido emitió una tarjeta de regalo: cancélalo en vez de eliminarlo. Si nadie la usó, la tarjeta se anula al cancelar.",
    );
  }
}

/* ------------------------------------------------ reservas vencidas (cron) */

export const GIFT_CARD_HOLD_DAYS = 7;

/**
 * Libera las reservas de pedidos cancelados o que llevan más de
 * `GIFT_CARD_HOLD_DAYS` sin pagarse. Una reserva por transacción: una fila
 * mala no frena a las demás. Si el job no corre un día, la reserva dura un
 * día más; al pagar tarde, `redeemGiftCardForOrder` vuelve a reservar.
 */
export async function releaseExpiredGiftCardHolds(
  db: PrismaClient,
  input: { now?: Date; storeId?: string } = {},
): Promise<{ released: number; skipped: number; failed: { orderId: string; error: string }[] }> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - GIFT_CARD_HOLD_DAYS * 24 * 60 * 60 * 1000);
  const orders = await db.order.findMany({
    where: {
      ...(input.storeId ? { storeId: input.storeId } : {}),
      giftCardId: { not: null },
      giftCardAmount: { gt: 0 },
      OR: [
        { status: { in: [OrderStatus.CANCELLED, OrderStatus.REJECTED] } },
        { status: { in: [OrderStatus.PENDING, OrderStatus.CREATED] }, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, storeId: true, giftCardId: true, giftCardAmount: true, status: true },
    take: 500,
  });
  const result = { released: 0, skipped: 0, failed: [] as { orderId: string; error: string }[] };
  for (const order of orders) {
    try {
      const movement = await db.$transaction((tx) =>
        releaseOrReverseGiftCardForOrder(tx, order, {
          createdBy: "SYSTEM_CRON",
          reason:
            order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED
              ? "Pedido cancelado"
              : `Pedido sin pagar por más de ${GIFT_CARD_HOLD_DAYS} días`,
        }),
      );
      if (movement) result.released += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed.push({ orderId: order.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
