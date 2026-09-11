import { ErrorFactory } from "@/lib/api-errors";
import { normalizeCouponCode } from "@/lib/coupon-code";
import { promotionWindowFilter } from "@/lib/promotion-window";
import { OrderStatus, type Prisma, type PrismaClient } from "@prisma/client";

/**
 * Disponibilidad real de un cupón.
 *
 * `usedCount` solo crece cuando un pedido queda pagado, así que entre crear el
 * pedido y cobrarlo el cupón está «reservado» por ese pedido. Contar esas
 * reservas al validar evita que varios pedidos pendientes se repartan el
 * último uso y todos terminen pagados por encima del máximo.
 */

/** Estados en los que un pedido sin pagar todavía puede cobrarse y consumir el cupón. */
export const COUPON_RESERVING_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PENDING];

type CouponDatabase = Pick<PrismaClient, "coupon" | "order">;

export interface CouponUsage {
  used: number;
  reserved: number;
  limit: number | null;
  remaining: number | null;
  exhausted: boolean;
}

/** Filtro Prisma de un cupón aplicable ahora mismo por código. */
export function activeCouponWhere(
  db: Pick<PrismaClient, "coupon">,
  storeId: string,
  code: string,
  now: Date = new Date(),
): Prisma.CouponWhereInput {
  return {
    storeId,
    code: normalizeCouponCode(code),
    isActive: true,
    ...promotionWindowFilter(now),
    OR: [
      { maxUses: null },
      {
        AND: [{ maxUses: { not: null } }, { usedCount: { lt: db.coupon.fields.maxUses } }],
      },
    ],
  };
}

export async function getCouponUsage(
  db: Pick<PrismaClient, "order">,
  coupon: { id: string; maxUses: number | null; usedCount: number },
  options: { excludeOrderId?: string } = {},
): Promise<CouponUsage> {
  const reserved = await db.order.count({
    where: {
      couponId: coupon.id,
      status: { in: COUPON_RESERVING_STATUSES },
      paidAt: null,
      ...(options.excludeOrderId ? { id: { not: options.excludeOrderId } } : {}),
    },
  });
  const limit = coupon.maxUses ?? null;
  const remaining = limit === null ? null : Math.max(limit - coupon.usedCount - reserved, 0);
  return {
    used: coupon.usedCount,
    reserved,
    limit,
    remaining,
    exhausted: limit !== null && coupon.usedCount + reserved >= limit,
  };
}

/** Rechaza el cupón cuando sus usos (pagados más reservados) ya llegaron al máximo. */
export async function assertCouponHasUses(
  db: Pick<PrismaClient, "order">,
  coupon: { id: string; code: string; maxUses: number | null; usedCount: number },
  options: { excludeOrderId?: string } = {},
): Promise<CouponUsage> {
  const usage = await getCouponUsage(db, coupon, options);
  if (usage.exhausted) {
    throw ErrorFactory.Conflict(
      usage.reserved > 0
        ? `El cupón ${coupon.code} ya alcanzó su máximo de usos: los últimos están reservados por pedidos pendientes de pago.`
        : `El cupón ${coupon.code} ya alcanzó su máximo de usos.`,
    );
  }
  return usage;
}

export const COUPON_RECENT_ORDERS_LIMIT = 5;

/** Datos del cupón que ve el panel: el registro, su uso real y sus últimos pedidos (sin datos personales). */
export async function getCouponDetail(db: CouponDatabase, storeId: string, couponId: string) {
  const coupon = await db.coupon.findFirst({ where: { id: couponId, storeId } });
  if (!coupon) return null;
  const [usage, ordersCount, recentOrders] = await Promise.all([
    getCouponUsage(db, coupon),
    db.order.count({ where: { couponId: coupon.id } }),
    db.order.findMany({
      where: { couponId: coupon.id },
      orderBy: { createdAt: "desc" },
      take: COUPON_RECENT_ORDERS_LIMIT,
      select: { id: true, orderNumber: true, status: true, paidAt: true, total: true, couponDiscount: true, createdAt: true },
    }),
  ]);
  return { ...coupon, usage, ordersCount, recentOrders };
}

export type CouponDetail = NonNullable<Awaited<ReturnType<typeof getCouponDetail>>>;

/** Otro beneficio de bienvenida activo y vigente en la tienda (excluyendo `exceptId`). */
export async function findOtherActiveWelcomeBenefit(db: Pick<PrismaClient, "coupon">, storeId: string, exceptId?: string) {
  return db.coupon.findFirst({
    where: {
      storeId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      isWelcomeBenefit: true,
      isActive: true,
      endDate: { gte: new Date() },
    },
    select: { code: true },
  });
}
