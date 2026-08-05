import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  DEFAULT_TAX_REPORT_PERIOD,
  createTaxReportPeriod,
  getTaxReport,
} from "@/lib/tax-reports";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function getReportPeriod(searchParams: URLSearchParams) {
  const startDate =
    searchParams.get("startDate") ?? DEFAULT_TAX_REPORT_PERIOD.startDate;
  const endDate =
    searchParams.get("endDate") ?? DEFAULT_TAX_REPORT_PERIOD.endDate;

  try {
    return createTaxReportPeriod(startDate, endDate);
  } catch (error) {
    throw ErrorFactory.InvalidRequest(
      error instanceof Error ? error.message : "Período inválido",
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const period = getReportPeriod(new URL(req.url).searchParams);
    const report = await getTaxReport(params.storeId, period);

    return NextResponse.json(report, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "TAX_REPORT_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
