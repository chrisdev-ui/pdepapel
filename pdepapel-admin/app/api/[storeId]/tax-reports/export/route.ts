import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createTaxReportWorkbook } from "@/lib/tax-report-xlsx";
import {
  DEFAULT_TAX_REPORT_PERIOD,
  createTaxReportPeriod,
  getTaxReport,
  parseTaxSalesDateBasis,
} from "@/lib/tax-reports";
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

    const searchParams = new URL(req.url).searchParams;
    const startDate =
      searchParams.get("startDate") ?? DEFAULT_TAX_REPORT_PERIOD.startDate;
    const endDate =
      searchParams.get("endDate") ?? DEFAULT_TAX_REPORT_PERIOD.endDate;

    let period;
    let salesDateBasis;
    try {
      period = createTaxReportPeriod(startDate, endDate);
      salesDateBasis = parseTaxSalesDateBasis(
        searchParams.get("salesDateBasis"),
      );
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error ? error.message : "Período inválido",
      );
    }

    const report = await getTaxReport(params.storeId, period, salesDateBasis);
    const workbook = await createTaxReportWorkbook(report);
    const filename = `reporte-tributario-${period.startDate}-a-${period.endDate}.xlsx`;

    return new NextResponse(workbook, {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "TAX_REPORT_EXPORT_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
