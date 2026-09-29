import {
  GiftCardMovementType,
  GiftCardStatus,
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
import { round2 } from "@/lib/order-totals";

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

/**
 * Lo que va a la pasarela: el total menos lo que cubre la tarjeta. `total`
 * no cambia nunca por una tarjeta (es un medio de pago, no un descuento);
 * los cinco sitios que firman o comprueban montos leen esto, no `total`.
 */
export function getAmountDue(order: {
  total: number;
  giftCardAmount?: number | null;
}): number {
  const covered = Number(order.giftCardAmount ?? 0);
  return Math.max(0, round2(Number(order.total) - covered));
}

export function isGiftCardOrder(order: { type?: OrderType | null }): boolean {
  return order.type === OrderType.GIFT_CARD;
}

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
      giftRecipientName: true,
      giftRecipientEmail: true,
      giftMessage: true,
    },
  });
  if (!order || order.type !== OrderType.GIFT_CARD) return null;

  const existing = await tx.giftCard.findUnique({ where: { purchaseOrderId: order.id } });
  const deliverTo = (order.giftRecipientEmail || order.email || "").trim().toLowerCase() || null;
  if (existing) return { card: existing, code: null, deliverTo };

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
