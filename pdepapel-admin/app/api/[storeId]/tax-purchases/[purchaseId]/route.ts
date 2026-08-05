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

  if (!invoiceNumber || !supplierName) {
    throw ErrorFactory.InvalidRequest(
      "El número de factura y la empresa son requeridos",
    );
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

async function ensurePurchaseAccess(
  userId: string | null,
  storeId: string,
  purchaseId: string,
) {
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  if (!purchaseId) throw ErrorFactory.InvalidRequest("Compra no encontrada");

  await verifyStoreOwner(userId, storeId);

  const purchase = await prismadb.taxPurchase.findFirst({
    where: { id: purchaseId, storeId },
    select: { id: true },
  });

  if (!purchase) throw ErrorFactory.NotFound("Compra no encontrada");
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; purchaseId: string } },
) {
  try {
    const { userId } = auth();
    await ensurePurchaseAccess(userId, params.storeId, params.purchaseId);
    const purchase = parsePurchase(await req.json());

    const duplicate = await prismadb.taxPurchase.findFirst({
      where: {
        storeId: params.storeId,
        supplierName: purchase.supplierName,
        invoiceNumber: purchase.invoiceNumber,
        id: { not: params.purchaseId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ErrorFactory.Conflict(
        "Ya existe una compra con esa factura y empresa",
      );
    }

    const updatedPurchase = await prismadb.taxPurchase.update({
      where: { id: params.purchaseId },
      data: purchase,
    });

    return NextResponse.json(updatedPurchase, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TAX_PURCHASE_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; purchaseId: string } },
) {
  try {
    const { userId } = auth();
    await ensurePurchaseAccess(userId, params.storeId, params.purchaseId);

    await prismadb.taxPurchase.delete({
      where: { id: params.purchaseId },
    });

    return NextResponse.json({ success: true }, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TAX_PURCHASE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
