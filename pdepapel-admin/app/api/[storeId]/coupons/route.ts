import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { DiscountType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const {
      code,
      type,
      amount,
      startDate,
      endDate,
      maxUses,
      minOrderValue,
      isActive,
    } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!code) throw ErrorFactory.InvalidRequest("Código requerido");
    if (!type) throw ErrorFactory.InvalidRequest("Tipo de descuento requerido");
    if (!amount) throw ErrorFactory.InvalidRequest("Monto requerido");
    if (!startDate)
      throw ErrorFactory.InvalidRequest("Fecha inicial requerida");
    if (!endDate) throw ErrorFactory.InvalidRequest("Fecha final requerida");

    if (type === DiscountType.PERCENTAGE && amount > 100) {
      throw ErrorFactory.InvalidRequest(
        "El descuento no puede ser mayor al 100%",
      );
    }

    if (amount < 0) {
      throw ErrorFactory.InvalidRequest("El monto no puede ser negativo");
    }

    if (new Date(startDate) > new Date(endDate)) {
      throw ErrorFactory.InvalidRequest(
        "La fecha inicial no puede ser mayor a la fecha final",
      );
    }

    const existingCoupon = await prismadb.coupon.findFirst({
      where: {
        storeId: params.storeId,
        code: code.toUpperCase(),
      },
    });

    if (existingCoupon) {
      throw ErrorFactory.Conflict("Ya existe un cupón con este código");
    }

    const coupon = await prismadb.coupon.create({
      data: {
        storeId: params.storeId,
        code: code.toUpperCase(),
        type,
        amount,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxUses: maxUses || 99,
        minOrderValue: minOrderValue || 0,
        isActive,
      },
    });

    return NextResponse.json(coupon);
  } catch (error) {
    return handleErrorResponse(error, "COUPON_POST");
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { searchParams } = req.nextUrl;
    const isActive = searchParams.get("isActive");

    const whereClause: any = {
      storeId: params.storeId,
    };

    if (isActive !== null) {
      whereClause.isActive = isActive === "true";
    }

    const coupons = await prismadb.coupon.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(coupons);
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_GET");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de cupones válidos en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const coupons = await tx.coupon.findMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
      });

      if (coupons.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunos cupones no se han encontrado o no pertenecen a esta tienda",
        );
      }

      for (const coupon of coupons) {
        if (coupon.usedCount && coupon.usedCount > 0) {
          throw ErrorFactory.Conflict(
            `El cupón ${coupon.code} no puede eliminarse porque ya ha sido utilizado`,
          );
        }
      }

      return await tx.coupon.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_DELETE");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de cupones válidos en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
      const coupons = await tx.coupon.findMany({
        where: {
          id: {
            in: ids,
          },
          storeId: params.storeId,
        },
      });

      if (coupons.length !== ids.length) {
        throw ErrorFactory.NotFound(
          "Algunos cupones no se han encontrado en esta tienda",
        );
      }

      const updatedCoupons = await Promise.all(
        coupons
          .filter((coupon) => coupon.isActive)
          .map((coupons) =>
            tx.coupon.update({
              where: { id: coupons.id },
              data: { isActive: false, endDate: new Date() },
            }),
          ),
      );

      return updatedCoupons;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_PATCH");
  }
}
