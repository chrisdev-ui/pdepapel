import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const overview = await getBusinessGrowthOverview(params.storeId);

    return NextResponse.json(overview, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_GROWTH_OVERVIEW_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
