import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import {
  resolveOrderInventoryIssue,
  retryOrderInventoryIssue,
} from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Cierra una incidencia de inventario de un pedido.
 * - `retry`: vuelve a intentar el movimiento que falló (queda enlazado).
 * - `resolve`: la administradora ya cuadró a mano; solo se registra quién y cuándo.
 */
export async function POST(
  request: Request,
  { params }: { params: { storeId: string; issueId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    const action =
      body.action === "retry" || body.action === "resolve" ? body.action : null;
    if (!action)
      throw ErrorFactory.InvalidRequest(
        "Acción no válida: usa «retry» o «resolve»",
      );

    const issue = await prismadb.$transaction(async (tx) =>
      action === "retry"
        ? retryOrderInventoryIssue(tx, {
            issueId: params.issueId,
            storeId: params.storeId,
            resolvedBy: userId,
          })
        : resolveOrderInventoryIssue(tx, {
            issueId: params.issueId,
            storeId: params.storeId,
            resolvedBy: userId,
          }),
    );
    if (action === "retry") await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(
      { success: true, issue: issue ?? null },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "ORDER_INVENTORY_ISSUE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
