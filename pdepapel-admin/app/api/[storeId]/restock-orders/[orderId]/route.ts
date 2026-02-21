import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const restockOrder = await prismadb.restockOrder.findUnique({
      where: {
        id: params.orderId,
        storeId: params.storeId, // Ensure it belongs to store
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
          orderBy: {
            index: "asc",
          },
        },
      },
    });

    if (!restockOrder) {
      throw ErrorFactory.NotFound("Restock Order not found");
    }

    return NextResponse.json(restockOrder, { headers: corsHeaders });
  } catch (error) {
    console.log("[RESTOCK_ORDER_GET]", error);
    return handleErrorResponse(error, "RESTOCK_ORDER_GET", {
      headers: corsHeaders,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();
    const { status, notes, items, supplierId } = body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.restockOrder.findUnique({
      where: { id: params.orderId, storeId: params.storeId },
      include: { items: true },
    });

    if (!order) throw ErrorFactory.NotFound("Restock Order not found");

    // Rules:
    // 1. If status is already COMPLETED or CANCELLED, restrict edits?
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      // Allow adding notes optionally, but not changing core data
      if (items || supplierId) {
        throw ErrorFactory.InvalidRequest(
          "Cannot edit completed or cancelled orders",
        );
      }
    }

    // 2. Logic for status transitions handled here strictly?
    // "Receiving" starts via the /receive endpoint, which updates status automatically.
    // Manual status override should be carefully controlled.

    // Calculate new total if items changed
    let totalAmount = order.totalAmount;
    let itemsUpdateOp = {};

    if (items && items.length > 0) {
      // Recalculate total from ALL items (existing + new/updated)
      // This logic is complex for partial updates.
      // Simplified: If items are passed, we might be replacing them or updating quantity.
      // For Drafts, we can replace. For ORDERED, we should probably restrictions.

      if (order.status !== "DRAFT") {
        throw ErrorFactory.InvalidRequest(
          "Cannot modify items after order is placed",
        );
      }

      // Full Replacement Strategy for Drafts (simplest for UI)
      // Delete existing and create new
      await prismadb.restockOrderItem.deleteMany({
        where: { restockOrderId: params.orderId },
      });

      itemsUpdateOp = {
        deleteMany: {},
        create: items.map((item: any, idx: number) => ({
          productId: item.productId,
          quantity: item.quantity,
          cost: item.cost,
          subtotal: Math.round(item.quantity * item.cost * 100) / 100,
          index: idx,
        })),
      };

      totalAmount =
        Math.round(
          items.reduce(
            (sum: number, item: any) => sum + item.quantity * item.cost,
            0,
          ) * 100,
        ) / 100;
    }

    const updatedOrder = await prismadb.restockOrder.update({
      where: { id: params.orderId },
      data: {
        status, // Allow status updates (e.g. DRAFT -> ORDERED, or to CANCELLED)
        notes,
        supplierId,
        totalAmount: items ? totalAmount : undefined,
        shippingCost:
          body.shippingCost !== undefined ? body.shippingCost : undefined,
        items: items ? itemsUpdateOp : undefined,
      },
      include: { items: true },
    });

    return NextResponse.json(updatedOrder, { headers: corsHeaders });
  } catch (error) {
    console.log("[RESTOCK_ORDER_PATCH]", error);
    return handleErrorResponse(error, "RESTOCK_ORDER_PATCH", {
      headers: corsHeaders,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const order = await prismadb.restockOrder.findUnique({
      where: { id: params.orderId, storeId: params.storeId },
    });

    if (!order) throw ErrorFactory.NotFound("Restock Order not found");

    if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
      throw ErrorFactory.InvalidRequest(
        "Only Draft or Cancelled orders can be deleted",
      );
    }

    await prismadb.restockOrder.delete({
      where: { id: params.orderId },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.log("[RESTOCK_ORDER_DELETE]", error);
    return handleErrorResponse(error, "RESTOCK_ORDER_DELETE", {
      headers: corsHeaders,
    });
  }
}
