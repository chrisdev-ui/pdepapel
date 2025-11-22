import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const provider = searchParams.get("provider") || undefined;
    const carrier = searchParams.get("carrier") || undefined;

    const shippings = await prismadb.shipping.findMany({
      where: {
        storeId: params.storeId,
        ...(status && { status: status as any }),
        ...(provider && { provider: provider as any }),
        ...(carrier && { carrierName: carrier }),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            fullName: true,
            phone: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(shippings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error: any) {
    return handleErrorResponse(error, "GET_SHIPPINGS", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
