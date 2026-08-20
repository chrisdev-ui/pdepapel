import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { assertWelcomeBenefitEligibility } from "@/lib/customer-benefits";
import { createCorsHeaders } from "@/lib/cors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, currencyFormatter } from "@/lib/utils";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    const { userId } = auth();
    const { code, subtotal } = await req.json();

    if (!code) {
      throw ErrorFactory.InvalidRequest("Se requiere el código del cupón");
    }

    if (!subtotal) {
      throw ErrorFactory.InvalidRequest("Se requiere el subtotal del pedido");
    }

    const now = getColombiaDate();
    const coupon = await prismadb.coupon.findFirst({
      where: {
        storeId: params.storeId,
        code: code.toUpperCase(),
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { maxUses: null },
          {
            AND: [
              { maxUses: { not: null } },
              { usedCount: { lt: prismadb.coupon.fields.maxUses } },
            ],
          },
        ],
      },
    });

    if (!coupon) {
      throw ErrorFactory.NotFound(
        "Este cupón no es válido: puede estar inactivo, no haber iniciado aún o ya haber expirado",
      );
    }

    if (subtotal && subtotal < Number(coupon.minOrderValue ?? 0)) {
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

    return NextResponse.json(coupon, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_VALIDATE", {
      headers: corsHeaders,
    });
  }
}
