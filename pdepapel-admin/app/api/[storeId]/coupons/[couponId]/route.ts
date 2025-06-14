import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { DiscountType } from "@prisma/client";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

    const coupon = await prismadb.coupon.findUnique({
      where: { id: params.couponId },
      include: {
        orders: true,
      },
    });

    if (!coupon) {
      throw ErrorFactory.NotFound("Cupón no encontrado");
    }

    return NextResponse.json(coupon, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

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

    const coupon = await prismadb.coupon.update({
      where: {
        id: params.couponId,
      },
      data: {
        code: code?.toUpperCase(),
        type,
        amount,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        maxUses,
        minOrderValue,
        isActive,
      },
    });

    return NextResponse.json(coupon, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    if (!params.couponId) {
      throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");
    }

    await verifyStoreOwner(userId, params.storeId);

    const coupon = await prismadb.coupon.findUnique({
      where: { id: params.couponId },
      include: { orders: true },
    });

    if (!coupon) {
      throw ErrorFactory.NotFound("Cupón no encontrado");
    }

    if (coupon.orders.length > 0) {
      throw ErrorFactory.Conflict(
        "No se puede eliminar un cupón que ya ha sido usado",
      );
    }

    await prismadb.coupon.delete({
      where: { id: params.couponId },
    });

    return NextResponse.json(coupon, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_DELETE");
  }
}

export async function PUT(
  _req: Request,
  { params }: { params: { storeId: string; couponId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.couponId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID del cupón");

    await verifyStoreOwner(userId, params.storeId);

    const coupon = await prismadb.coupon.findUnique({
      where: { id: params.couponId },
    });

    if (!coupon) {
      throw ErrorFactory.NotFound("Cupón no encontrado");
    }

    if (!coupon.isActive) {
      throw ErrorFactory.Conflict("El cupón ya está inactivo");
    }

    const invalidatedCoupon = await prismadb.coupon.update({
      where: { id: params.couponId },
      data: {
        isActive: false,
        endDate: new Date(),
      },
    });

    return NextResponse.json(invalidatedCoupon, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COUPON_INVALIDATE");
  }
}
