import { ErrorFactory } from "@/lib/api-errors";
import { normalizeCouponCode } from "@/lib/coupon-code";
import { activeCouponWhere, assertCouponHasUses } from "@/lib/coupon-availability";
import prismadb from "@/lib/prismadb";
import type { Coupon, PrismaClient } from "@prisma/client";

type CouponLookupDatabase = Pick<PrismaClient, "coupon" | "order">;

export async function resolveCouponForOrderUpdate({
  storeId,
  couponCode,
  couponCodeProvided,
  existingCoupon,
  database = prismadb,
  now = new Date(),
  orderId,
}: {
  storeId: string;
  couponCode: unknown;
  couponCodeProvided: boolean;
  existingCoupon: Coupon | null;
  database?: CouponLookupDatabase;
  now?: Date;
  /** Pedido que se está editando: su propia reserva no cuenta contra el cupón. */
  orderId?: string;
}): Promise<Coupon | null> {
  if (!couponCodeProvided) return existingCoupon;

  if (couponCode != null && typeof couponCode !== "string") {
    throw ErrorFactory.InvalidRequest("El código del cupón no es válido");
  }

  const normalizedCode = normalizeCouponCode(couponCode || "");
  if (!normalizedCode) return null;

  if (
    existingCoupon &&
    normalizeCouponCode(existingCoupon.code) === normalizedCode
  ) {
    return existingCoupon;
  }

  const coupon = await database.coupon.findFirst({
    where: activeCouponWhere(database, storeId, normalizedCode, now),
  });

  if (!coupon) {
    throw ErrorFactory.NotFound("Código de cupón no válido o expirado");
  }

  await assertCouponHasUses(database, coupon, { excludeOrderId: orderId });

  return coupon;
}

export function assertCouponMinimumOrderValue(
  coupon: Coupon | null,
  subtotal: number,
) {
  if (!coupon || subtotal >= Number(coupon.minOrderValue ?? 0)) return;

  const minimum = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(coupon.minOrderValue ?? 0));

  throw ErrorFactory.Conflict(
    `El pedido debe ser mayor a ${minimum} para usar este cupón`,
  );
}
