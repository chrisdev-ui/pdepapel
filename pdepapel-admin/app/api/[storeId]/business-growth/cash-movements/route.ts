import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseBusinessCashMovement } from "@/lib/business-growth-api";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const movement = parseBusinessCashMovement(await req.json());
    const createdMovement = await prismadb.businessCashMovement.create({
      data: { ...movement, storeId: params.storeId, createdBy: userId },
    });

    return NextResponse.json(createdMovement, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_CASH_MOVEMENT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
