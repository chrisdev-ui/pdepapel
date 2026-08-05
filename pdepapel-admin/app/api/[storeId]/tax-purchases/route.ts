import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { createTaxReportPeriod } from "@/lib/tax-reports";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function parsePurchase(body: Record<string, unknown>) {
  const invoiceNumber = String(body.invoiceNumber ?? "").trim();
  const supplierName = String(body.supplierName ?? "").trim();
  const totalAmount = Number(body.totalAmount);
  const issuedAt = String(body.issuedAt ?? "");
  const notes = String(body.notes ?? "").trim();

  if (!invoiceNumber) {
    throw ErrorFactory.InvalidRequest("El número de factura es requerido");
  }
  if (!supplierName) {
    throw ErrorFactory.InvalidRequest("El nombre de la empresa es requerido");
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw ErrorFactory.InvalidRequest("El valor debe ser mayor que cero");
  }

  try {
    return {
      invoiceNumber,
      supplierName,
      totalAmount,
      issuedAt: createTaxReportPeriod(issuedAt, issuedAt).start,
      notes: notes || null,
    };
  } catch {
    throw ErrorFactory.InvalidRequest("La fecha de factura no es válida");
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const purchase = parsePurchase(await req.json());

    const existingPurchase = await prismadb.taxPurchase.findFirst({
      where: {
        storeId: params.storeId,
        supplierName: purchase.supplierName,
        invoiceNumber: purchase.invoiceNumber,
      },
      select: { id: true },
    });

    if (existingPurchase) {
      throw ErrorFactory.Conflict(
        "Ya existe una compra con esa factura y empresa",
      );
    }

    const createdPurchase = await prismadb.taxPurchase.create({
      data: {
        ...purchase,
        storeId: params.storeId,
      },
    });

    return NextResponse.json(createdPurchase, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TAX_PURCHASE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
