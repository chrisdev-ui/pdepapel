import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getBusinessGrowthOverview } from "@/lib/business-growth-data";
import { resolveBusinessGrowthPeriod } from "@/lib/business-growth-period";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const url = new URL(req.url);
    const period = resolveBusinessGrowthPeriod({
      month: url.searchParams.get("month"),
      year: url.searchParams.get("year"),
    });
    const overview = await getBusinessGrowthOverview(
      params.storeId,
      period.referenceDate,
    );

    return NextResponse.json(overview, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BUSINESS_GROWTH_OVERVIEW_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
