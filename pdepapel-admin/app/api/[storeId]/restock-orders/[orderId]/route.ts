import { auth } from "@clerk/nextjs/server";
import { RestockOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { assertRestockReferences, RESTOCK_ORDER_INCLUDE } from "@/lib/restock-orders-db";
import {
  areRestockLinesLocked,
  canTransitionRestockOrder,
  describeForbiddenRestockTransition,
  getRestockProgress,
  lineSubtotal,
  restockOrderPatchSchema,
  summarizeLines,
} from "@/lib/restock-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const restockOrder = await prismadb.restockOrder.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      include: RESTOCK_ORDER_INCLUDE,
    });
    if (!restockOrder) throw ErrorFactory.NotFound("El pedido de aprovisionamiento no existe.");

    return NextResponse.json(restockOrder, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDER_GET", { headers: corsHeaders });
  }
}

export async function PATCH(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = restockOrderPatchSchema.safeParse(await req.json());
    if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos del pedido no válidos.");
    const patch = parsed.data;

    const order = await prismadb.restockOrder.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      include: { items: true },
    });
    if (!order) throw ErrorFactory.NotFound("El pedido de aprovisionamiento no existe.");

    const progress = getRestockProgress(order.items);
    const context = { receivedUnits: progress.receivedUnits };

    const nextStatus = patch.status && patch.status !== order.status ? patch.status : undefined;
    if (nextStatus && !canTransitionRestockOrder(order.status, nextStatus, context)) {
      throw ErrorFactory.InvalidRequest(describeForbiddenRestockTransition(order.status, nextStatus, context));
    }

    const touchesLines = patch.items !== undefined || patch.supplierId !== undefined || patch.shippingCost !== undefined;
    if (touchesLines && areRestockLinesLocked(order.status)) {
      throw ErrorFactory.InvalidRequest(
        "Las líneas, el proveedor y el envío quedan fijos al pedir al proveedor; después solo cambian las notas.",
      );
    }
    if (order.status === RestockOrderStatus.CANCELLED && patch.notes !== undefined && !nextStatus) {
      throw ErrorFactory.InvalidRequest("Un pedido cancelado no se edita. Vuélvelo a borrador para retomarlo.");
    }
    if (nextStatus === RestockOrderStatus.ORDERED) {
      const lines = patch.items ?? order.items;
      if (lines.length === 0) throw ErrorFactory.InvalidRequest("Agrega al menos un producto antes de pedir al proveedor.");
    }

    if (touchesLines) {
      const supplierId = patch.supplierId ?? order.supplierId;
      const productIds = (patch.items ?? order.items).map((item) => item.productId);
      await assertRestockReferences(params.storeId, supplierId, productIds);
    }

    const updated = await prismadb.$transaction(async (tx) => {
      if (patch.items) {
        await tx.restockOrderItem.deleteMany({ where: { restockOrderId: order.id } });
        await tx.restockOrderItem.createMany({
          data: patch.items.map((item, index) => ({
            restockOrderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            cost: item.cost,
            subtotal: lineSubtotal(item.quantity, item.cost),
            index,
          })),
        });
      }
      return tx.restockOrder.update({
        where: { id: order.id },
        data: {
          ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(patch.supplierId !== undefined ? { supplierId: patch.supplierId } : {}),
          ...(patch.shippingCost !== undefined ? { shippingCost: patch.shippingCost } : {}),
          ...(patch.items ? { totalAmount: summarizeLines(patch.items).totalAmount } : {}),
        },
        include: RESTOCK_ORDER_INCLUDE,
      });
    });

    return NextResponse.json(updated, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDER_PATCH", { headers: corsHeaders });
  }
}

export async function DELETE(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.restockOrder.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      include: { items: { select: { quantityReceived: true } } },
    });
    if (!order) throw ErrorFactory.NotFound("El pedido de aprovisionamiento no existe.");

    const deletable = order.status === RestockOrderStatus.DRAFT || order.status === RestockOrderStatus.CANCELLED;
    if (!deletable) {
      throw ErrorFactory.InvalidRequest("Solo se eliminan borradores o pedidos cancelados; los demás son historial de compras.");
    }
    if (order.items.some((item) => item.quantityReceived > 0)) {
      throw ErrorFactory.Conflict("Este pedido tiene mercancía recibida en inventario y no se puede eliminar.");
    }

    await prismadb.restockOrder.delete({ where: { id: order.id } });

    return NextResponse.json({ success: true }, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDER_DELETE", { headers: corsHeaders });
  }
}
