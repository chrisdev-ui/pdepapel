import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthorized();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const now = new Date();

    await prismadb.$transaction([
      prismadb.coupon.updateMany({
        where: {
          storeId: params.storeId,
        },
        data: {
          isActive: {
            set: false,
          },
        },
      }),
      prismadb.coupon.updateMany({
        where: {
          storeId: params.storeId,
          startDate: {
            lte: now,
          },
          endDate: {
            gte: now,
          },
        },
        data: {
          isActive: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        message: "Se han activado todos los cupones válidos",
      },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_UPDATE_VALIDITY");
  }
}
