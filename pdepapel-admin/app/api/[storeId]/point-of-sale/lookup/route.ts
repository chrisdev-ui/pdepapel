import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

function getProductIdFromCode(code: string) {
  const match = /^PDP:([a-z0-9-]+)$/i.exec(code);
  return match?.[1];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const code = req.nextUrl.searchParams.get("code")?.trim();
    if (!code) throw ErrorFactory.InvalidRequest("Ingresa o escanea un código");

    const productId = getProductIdFromCode(code);
    const product = await prismadb.product.findFirst({
      where: {
        storeId: params.storeId,
        isArchived: false,
        OR: productId
          ? [{ id: productId }]
          : [{ sku: code }, { gtin: code }],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        gtin: true,
        stock: true,
        price: true,
        isKit: true,
        images: { orderBy: { isMain: "desc" }, take: 1 },
      },
    });
    if (!product || product.stock <= 0) {
      throw ErrorFactory.NotFound(
        "No hay inventario disponible para este código",
      );
    }

    return NextResponse.json({ product });
  } catch (error) {
    return handleErrorResponse(error, "POINT_OF_SALE_LOOKUP_GET");
  }
}
