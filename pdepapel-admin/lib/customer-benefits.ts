import { AppError, ErrorFactory } from "@/lib/api-errors";
import { hasMatchingOrderAccountEmail, normalizeOrderAccountEmail } from "@/lib/order-account-claims";
import { clerkClient } from "@clerk/nextjs";
import {
  Coupon,
  CouponRedemptionStatus,
  OrderStatus,
  OrderType,
  Prisma,
} from "@prisma/client";

/** Transaction-scoped client used to reserve, redeem, and release the benefit. */
export type WelcomeBenefitDatabase = Pick<
  Prisma.TransactionClient,
  "couponRedemption"
>;

/** Client used to check eligibility, which also needs to count previous orders. */
export type WelcomeBenefitEligibilityDatabase = Pick<
  typeof import("@/lib/prismadb").default,
  "order" | "couponRedemption"
>;

export async function getVerifiedPrimaryEmail(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  if (primaryEmailAddress?.verification?.status !== "verified") {
    throw new AppError(
      "Confirma el correo de tu cuenta para usar este beneficio",
      403,
    );
  }

  return primaryEmailAddress.emailAddress;
}

export function getWelcomeBenefitFilter(storeId: string, now: Date) {
  return {
    storeId,
    isWelcomeBenefit: true,
    isActive: true,
    startDate: { lte: now },
    endDate: { gte: now },
  } satisfies Prisma.CouponWhereInput;
}

export async function assertWelcomeBenefitEligibility({
  coupon,
  storeId,
  userId,
  checkoutEmail,
  database,
}: {
  coupon: Coupon;
  storeId: string;
  userId: string | null;
  checkoutEmail?: string | null;
  database: WelcomeBenefitEligibilityDatabase;
}) {
  if (!coupon.isWelcomeBenefit) return null;

  if (!userId) {
    throw new AppError(
      "Inicia sesión o crea una cuenta para usar el beneficio de bienvenida",
      401,
    );
  }

  const verifiedEmail = await getVerifiedPrimaryEmail(userId);
  if (
    checkoutEmail &&
    !hasMatchingOrderAccountEmail(checkoutEmail, verifiedEmail)
  ) {
    throw new AppError(
      "Usa el correo verificado de tu cuenta para este beneficio",
      403,
    );
  }

  const [paidOrders, redemption] = await Promise.all([
    database.order.count({
      where: {
        storeId,
        userId,
        type: OrderType.STANDARD,
        status: OrderStatus.PAID,
      },
    }),
    database.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
      select: { status: true },
    }),
  ]);

  if (paidOrders > 0 || redemption?.status === CouponRedemptionStatus.REDEEMED) {
    throw ErrorFactory.Conflict(
      "El beneficio de bienvenida ya fue usado en esta cuenta",
    );
  }

  if (redemption?.status === CouponRedemptionStatus.RESERVED) {
    throw ErrorFactory.Conflict(
      "Este beneficio ya está reservado para un pedido pendiente de pago",
    );
  }

  return normalizeOrderAccountEmail(verifiedEmail);
}

export async function reserveWelcomeBenefit(
  database: WelcomeBenefitDatabase,
  {
    couponId,
    storeId,
    userId,
    orderId,
  }: {
    couponId: string;
    storeId: string;
    userId: string;
    orderId: string;
  },
) {
  const existing = await database.couponRedemption.findUnique({
    where: { couponId_userId: { couponId, userId } },
    select: { id: true, status: true },
  });

  if (existing?.status === CouponRedemptionStatus.RESERVED) {
    throw ErrorFactory.Conflict(
      "Este beneficio ya está reservado para un pedido pendiente de pago",
    );
  }

  if (existing?.status === CouponRedemptionStatus.REDEEMED) {
    throw ErrorFactory.Conflict(
      "El beneficio de bienvenida ya fue usado en esta cuenta",
    );
  }

  if (existing) {
    await database.couponRedemption.update({
      where: { id: existing.id },
      data: {
        orderId,
        status: CouponRedemptionStatus.RESERVED,
        redeemedAt: null,
        releasedAt: null,
      },
    });
    return;
  }

  try {
    await database.couponRedemption.create({
      data: {
        couponId,
        storeId,
        userId,
        orderId,
        status: CouponRedemptionStatus.RESERVED,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw ErrorFactory.Conflict(
        "Este beneficio ya está reservado para un pedido pendiente de pago",
      );
    }

    throw error;
  }
}

export async function markWelcomeBenefitRedeemed(
  database: WelcomeBenefitDatabase,
  {
    couponId,
    userId,
    orderId,
  }: {
    couponId: string | null | undefined;
    userId: string | null | undefined;
    orderId: string;
  },
) {
  if (!couponId || !userId) return;

  await database.couponRedemption.updateMany({
    where: {
      couponId,
      userId,
      orderId,
      status: CouponRedemptionStatus.RESERVED,
    },
    data: {
      status: CouponRedemptionStatus.REDEEMED,
      redeemedAt: new Date(),
      releasedAt: null,
    },
  });
}

export async function releaseWelcomeBenefitReservation(
  database: WelcomeBenefitDatabase,
  {
    couponId,
    userId,
    orderId,
  }: {
    couponId: string | null | undefined;
    userId: string | null | undefined;
    orderId: string;
  },
) {
  if (!couponId || !userId) return;

  await database.couponRedemption.updateMany({
    where: {
      couponId,
      userId,
      orderId,
      status: { in: [CouponRedemptionStatus.RESERVED, CouponRedemptionStatus.REDEEMED] },
    },
    data: {
      status: CouponRedemptionStatus.RELEASED,
      releasedAt: new Date(),
    },
  });
}
