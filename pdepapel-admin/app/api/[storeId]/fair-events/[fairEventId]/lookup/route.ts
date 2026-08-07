import { auth } from "@clerk/nextjs";
import { FairCapsuleStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getFairStockAvailability } from "@/lib/fair-events";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
    if (!code) throw ErrorFactory.InvalidRequest("Ingresa o escanea un código");

    const capsule = await prismadb.fairCapsule.findFirst({
      where: {
        fairEventId: params.fairEventId,
        code,
        status: FairCapsuleStatus.PACKED,
        fairEvent: { storeId: params.storeId },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
    if (capsule) {
      return NextResponse.json({
        kind: "capsule",
        code: capsule.code,
        salePrice: capsule.salePrice,
        product: capsule.product,
      });
    }

    const eventItem = await prismadb.fairEventInventoryItem.findFirst({
      where: {
        fairEventId: params.fairEventId,
        fairEvent: { storeId: params.storeId },
        product: {
          OR: [{ sku: code }, { gtin: code }],
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            images: { orderBy: { isMain: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!eventItem || getFairStockAvailability(eventItem) <= 0) {
      throw ErrorFactory.NotFound(
        "No hay inventario disponible para este código",
      );
    }

    return NextResponse.json({ kind: "product", product: eventItem.product });
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_LOOKUP_GET");
  }
}
