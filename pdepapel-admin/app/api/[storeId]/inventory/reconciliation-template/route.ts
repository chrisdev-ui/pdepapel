import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createFairReconciliationTemplateWorkbook } from "@/lib/fair-reconciliation-template-xlsx";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
        isKit: false,
      },
      select: { sku: true, name: true, stock: true },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
    });
    const workbook = await createFairReconciliationTemplateWorkbook(products);
    const filename = "plantilla-conciliacion-inventario-feria.xlsx";

    return new NextResponse(workbook, {
      headers: {
        ...CACHE_HEADERS.NO_CACHE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "RECONCILIATION_TEMPLATE_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
