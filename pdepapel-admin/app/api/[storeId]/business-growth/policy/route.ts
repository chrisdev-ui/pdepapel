import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseBusinessCashPolicy } from "@/lib/business-growth-api";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const policy = parseBusinessCashPolicy(await req.json());
    const updatedPolicy = await prismadb.businessCashPolicy.upsert({
      where: { storeId: params.storeId },
      update: policy,
      create: { storeId: params.storeId, ...policy },
    });

    return NextResponse.json(updatedPolicy, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_GROWTH_POLICY_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
