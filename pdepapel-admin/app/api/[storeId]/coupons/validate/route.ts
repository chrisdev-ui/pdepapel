import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { activeCouponWhere, assertCouponHasUses } from "@/lib/coupon-availability";
import { PUBLIC_COUPON_SELECT } from "@/lib/coupons";
import { createCorsHeaders } from "@/lib/cors";
import { assertWelcomeBenefitEligibility } from "@/lib/customer-benefits";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, currencyFormatter } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

/** Valida un código para la tienda. Público a propósito; devuelve solo lo que el carrito necesita. */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    const { userId } = await auth();
    const { code, subtotal } = await req.json();

    if (typeof code !== "string" || !code.trim()) {
      throw ErrorFactory.InvalidRequest("Se requiere el código del cupón");
    }
    if (typeof subtotal !== "number" || !Number.isFinite(subtotal) || subtotal <= 0) {
      throw ErrorFactory.InvalidRequest("Se requiere el subtotal del pedido");
    }

    const coupon = await prismadb.coupon.findFirst({
      where: activeCouponWhere(prismadb, params.storeId, code),
    });

    if (!coupon) {
      throw ErrorFactory.NotFound(
        "Este cupón no es válido: puede estar inactivo, no haber iniciado aún o ya haber expirado",
      );
    }

    await assertCouponHasUses(prismadb, coupon);

    if (subtotal < Number(coupon.minOrderValue ?? 0)) {
      throw ErrorFactory.Conflict(
        `El pedido debe ser mayor a ${currencyFormatter(coupon.minOrderValue ?? 0)} para usar este cupón`,
      );
    }

    await assertWelcomeBenefitEligibility({
      coupon,
      storeId: params.storeId,
      userId,
      database: prismadb,
    });

    const publicCoupon = Object.fromEntries(
      Object.keys(PUBLIC_COUPON_SELECT).map((key) => [key, coupon[key as keyof typeof PUBLIC_COUPON_SELECT]]),
    );

    return NextResponse.json(publicCoupon, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_VALIDATE", { headers: corsHeaders });
  }
}
