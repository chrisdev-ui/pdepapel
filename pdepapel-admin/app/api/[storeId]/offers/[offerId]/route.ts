import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { DiscountType } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId)
      throw ErrorFactory.InvalidRequest("ID de oferta requerido");

    const offer = await prismadb.offer.findUnique({
      where: {
        id: params.offerId,
        storeId: params.storeId,
      },
      include: {
        products: true,
        categories: true,
      },
    });

    if (!offer) throw ErrorFactory.NotFound("Oferta no encontrada");

    return NextResponse.json(offer, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId)
      throw ErrorFactory.InvalidRequest("ID de oferta requerido");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const {
      name,
      label,
      type,
      amount,
      startDate,
      endDate,
      isActive,
      productIds,
      categoryIds,
    } = body;

    if (!name) throw ErrorFactory.InvalidRequest("El nombre es requerido");
    if (!type)
      throw ErrorFactory.InvalidRequest("El tipo de descuento es requerido");
    if (amount === undefined || amount < 0)
      throw ErrorFactory.InvalidRequest(
        "El monto es requerido y debe ser positivo",
      );
    if (!startDate)
      throw ErrorFactory.InvalidRequest("La fecha de inicio es requerida");
    if (!endDate)
      throw ErrorFactory.InvalidRequest("La fecha de fin es requerida");

    if (type === DiscountType.PERCENTAGE && amount > 100) {
      throw ErrorFactory.InvalidRequest(
        "El porcentaje no puede ser mayor a 100",
      );
    }

    const offer = await prismadb.offer.update({
      where: {
        id: params.offerId,
        storeId: params.storeId,
      },
      data: {
        name,
        label,
        type,
        amount,
        startDate: getColombiaDate(new Date(startDate)),
        endDate: getColombiaDate(new Date(endDate)),
        isActive: isActive,
        products: {
          deleteMany: {}, // Remove all existing links
          create: (productIds || []).map((id: string) => ({
            product: { connect: { id } },
          })),
        },
        categories: {
          deleteMany: {}, // Remove all existing links
          create: (categoryIds || []).map((id: string) => ({
            category: { connect: { id } },
          })),
        },
      },
      include: {
        products: true,
        categories: true,
      },
    });

    // Invalidate Redis cache
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.del(`store:${params.storeId}:active-offers`);
    } catch (error) {
      console.error("Redis delete error:", error);
    }

    return NextResponse.json(offer, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId)
      throw ErrorFactory.InvalidRequest("ID de oferta requerido");

    await verifyStoreOwner(userId, params.storeId);

    const offer = await prismadb.offer.delete({
      where: {
        id: params.offerId,
        storeId: params.storeId,
      },
    });

    // Invalidate Redis cache
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.del(`store:${params.storeId}:active-offers`);
    } catch (error) {
      console.error("Redis delete error:", error);
    }

    return NextResponse.json(offer, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_DELETE");
  }
}
