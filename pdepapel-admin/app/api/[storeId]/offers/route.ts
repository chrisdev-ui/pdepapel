import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { auth } from "@clerk/nextjs";
import { DiscountType } from "@prisma/client";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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
      productGroupIds,
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

    const offer = await prismadb.offer.create({
      data: {
        storeId: params.storeId,
        name,
        label,
        type,
        amount,
        startDate: getColombiaDate(new Date(startDate)),
        endDate: getColombiaDate(new Date(endDate)),
        isActive: isActive ?? true,
        products: {
          create: (productIds || []).map((id: string) => ({
            product: { connect: { id } },
          })),
        },
        categories: {
          create: (categoryIds || []).map((id: string) => ({
            category: { connect: { id } },
          })),
        },
        productGroups: {
          create: (productGroupIds || []).map((id: string) => ({
            productGroup: { connect: { id } },
          })),
        },
      },
      include: {
        products: true,
        categories: true,
        productGroups: true,
      },
    });

    // Invalidate Redis cache
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.del(`store:${params.storeId}:active-offers`);
      const productKeys = await redis.keys(
        `store:${params.storeId}:products:*`,
      );
      if (productKeys.length > 0) {
        await redis.del(...productKeys);
      }
    } catch (error) {
      console.error("Redis delete error:", error);
    }

    return NextResponse.json(offer, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const offers = await prismadb.offer.findMany({
      where: { storeId: params.storeId },
      include: {
        products: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
        categories: {
          include: {
            category: {
              select: { name: true },
            },
          },
        },
        productGroups: {
          include: {
            productGroup: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(offers, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_GET");
  }
}
