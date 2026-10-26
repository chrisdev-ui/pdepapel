import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { resolveOrderInventoryIssue } from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * «Conciliar todas las líneas» de un pedido: cada línea abierta queda como
 * «Marcar como conciliado» (la administradora ya cuadró a mano); no se mueve
 * stock. Todo o nada, en una transacción.
 */
export async function POST(_request: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const resolved = await prismadb.$transaction(async (tx) => {
      const open = await tx.orderInventoryIssue.findMany({
        where: { storeId: params.storeId, orderId: params.orderId, resolvedAt: null },
        select: { id: true },
      });
      if (open.length === 0) throw ErrorFactory.NotFound("Este pedido no tiene líneas de inventario sin cuadrar.");
      for (const issue of open) await resolveOrderInventoryIssue(tx, { issueId: issue.id, storeId: params.storeId, resolvedBy: userId });
      return open.length;
    });
    return NextResponse.json({ resolved }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_INVENTORY_ISSUES_RESOLVE_ALL");
  }
}
