import { NewsletterSubscriberStatus, type PrismaClient } from "@prisma/client";

/**
 * Limpieza del boletín sin `prismadb` ni `env`: la usan el cron, los guiones
 * de `prod:write` (con su propio cliente) y las pruebas de integración.
 */
type NewsletterDb = Pick<PrismaClient, "newsletterSubscriber" | "coupon" | "order">;

/**
 * Una alta pendiente nunca dio su consentimiento: a los 7 días se borra, salvo
 * que tenga un enlace vigente (pidió otro hace menos de 48 h). Activos, dados
 * de baja y bloqueados no se tocan nunca desde aquí.
 */
export const NEWSLETTER_PENDING_RETENTION_DAYS = 7;

export async function deleteExpiredPendingNewsletterSignups(
  db: NewsletterDb,
  options: { storeId?: string; now?: Date; dryRun?: boolean } = {},
): Promise<{ matched: number; deleted: number; cutoff: Date; olderThanDays: number }> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - NEWSLETTER_PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const where = {
    status: NewsletterSubscriberStatus.PENDING,
    createdAt: { lt: cutoff },
    OR: [{ confirmationExpiresAt: null }, { confirmationExpiresAt: { lt: now } }],
    ...(options.storeId ? { storeId: options.storeId } : {}),
  };

  if (options.dryRun) {
    const matched = await db.newsletterSubscriber.count({ where });
    return { matched, deleted: 0, cutoff, olderThanDays: NEWSLETTER_PENDING_RETENTION_DAYS };
  }
  const { count } = await db.newsletterSubscriber.deleteMany({ where });
  return { matched: count, deleted: count, cutoff, olderThanDays: NEWSLETTER_PENDING_RETENTION_DAYS };
}

/**
 * Altas «activas» que confirmó un escáner de enlaces (la página confirmaba al
 * abrirse, 2026-10-08 a 2026-10-25). Regla revisada por la dueña: estado
 * ACTIVE y creadas desde el 2026-10-08.
 */
export const SCANNER_CONFIRMED_SINCE = new Date("2026-10-08T00:00:00.000Z");

export type ScannerConfirmedPlan = {
  subscriberIds: string[];
  /** Cupones de bienvenida sin uso: se desactivan. */
  couponIdsToDeactivate: string[];
  /** Cupones ya usados en un pedido: se dejan como están. */
  usedCouponIds: string[];
};

export async function planScannerConfirmedSuppression(
  db: NewsletterDb,
  /** `confirmedBefore` = el despliegue del botón: lo confirmado después lo hizo una persona con el clic. */
  options: { storeId: string; confirmedBefore: Date; since?: Date },
): Promise<ScannerConfirmedPlan> {
  const subscribers = await db.newsletterSubscriber.findMany({
    where: {
      storeId: options.storeId,
      status: NewsletterSubscriberStatus.ACTIVE,
      createdAt: { gte: options.since ?? SCANNER_CONFIRMED_SINCE },
      confirmedAt: { lt: options.confirmedBefore },
    },
    select: { id: true, welcomeCouponId: true },
    orderBy: { createdAt: "asc" },
  });
  const couponIds = subscribers.flatMap((row) => (row.welcomeCouponId ? [row.welcomeCouponId] : []));
  const [coupons, ordersWithCoupon] = await Promise.all([
    couponIds.length
      ? db.coupon.findMany({ where: { id: { in: couponIds }, storeId: options.storeId }, select: { id: true, usedCount: true, isActive: true } })
      : Promise.resolve([]),
    couponIds.length
      ? db.order.findMany({ where: { couponId: { in: couponIds } }, select: { couponId: true }, distinct: ["couponId"] })
      : Promise.resolve([]),
  ]);
  const usedOnOrder = new Set(ordersWithCoupon.flatMap((order) => (order.couponId ? [order.couponId] : [])));
  const used = coupons.filter((coupon) => coupon.usedCount > 0 || usedOnOrder.has(coupon.id));
  const usedIds = new Set(used.map((coupon) => coupon.id));

  return {
    subscriberIds: subscribers.map((row) => row.id),
    couponIdsToDeactivate: coupons.filter((coupon) => coupon.isActive && !usedIds.has(coupon.id)).map((coupon) => coupon.id),
    usedCouponIds: used.map((coupon) => coupon.id),
  };
}

/**
 * Pasa a dados de baja sin enviar nada y desactiva sus cupones sin uso. Solo
 * toca filas que siguen ACTIVE y cupones que siguen sin uso, así que repetirla
 * no cambia nada.
 */
export async function applyScannerConfirmedSuppression(
  db: NewsletterDb,
  plan: ScannerConfirmedPlan,
  options: { storeId: string; now?: Date },
): Promise<{ unsubscribed: number; couponsDeactivated: number }> {
  const now = options.now ?? new Date();
  const unsubscribed = plan.subscriberIds.length
    ? await db.newsletterSubscriber.updateMany({
        where: { id: { in: plan.subscriberIds }, storeId: options.storeId, status: NewsletterSubscriberStatus.ACTIVE },
        data: {
          status: NewsletterSubscriberStatus.UNSUBSCRIBED,
          unsubscribedAt: now,
          confirmationTokenHash: null,
          confirmationExpiresAt: null,
        },
      })
    : { count: 0 };
  const couponsDeactivated = plan.couponIdsToDeactivate.length
    ? await db.coupon.updateMany({
        where: { id: { in: plan.couponIdsToDeactivate }, storeId: options.storeId, usedCount: 0, isActive: true },
        data: { isActive: false },
      })
    : { count: 0 };
  return { unsubscribed: unsubscribed.count, couponsDeactivated: couponsDeactivated.count };
}
