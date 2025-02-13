import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { currencyFormatter } from "@/lib/utils";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { code, subtotal } = await req.json();

    if (!code) {
      throw ErrorFactory.InvalidRequest("Se requiere el código del cupón");
    }

    if (!subtotal) {
      throw ErrorFactory.InvalidRequest("Se requiere el subtotal del pedido");
    }

    const coupon = await prismadb.coupon.findFirst({
      where: {
        storeId: params.storeId,
        code: code.toUpperCase(),
        isActive: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        OR: [
          { maxUses: null },
          {
            AND: [
              { maxUses: { not: null } },
              { usedCount: { lt: prisma?.coupon.fields.maxUses } },
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
        `El pedido debe ser mayor a ${currencyFormatter.format(coupon.minOrderValue ?? 0)} para usar este cupón`,
      );
    }

    return NextResponse.json(coupon, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_VALIDATE", {
      headers: corsHeaders,
    });
  }
}
