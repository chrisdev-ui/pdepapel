import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import {
  createInventoryMovementBatch,
  CreateInventoryMovementParams,
} from "@/lib/inventory";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    // Payload: { receivedItems: { restockOrderItemId, quantityReceived, cost? }[] }
    const { receivedItems } = body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (
      !receivedItems ||
      !Array.isArray(receivedItems) ||
      receivedItems.length === 0
    ) {
      throw ErrorFactory.InvalidRequest("No items to receive");
    }

    const order = await prismadb.restockOrder.findUnique({
      where: { id: params.orderId, storeId: params.storeId },
      include: { items: true },
    });

    if (!order) throw ErrorFactory.NotFound("Restock Order not found");
    if (order.status === "DRAFT" || order.status === "CANCELLED") {
      throw ErrorFactory.InvalidRequest(
        "Order must be placed before receiving",
      );
    }

    // Prepare batch processing
    const inventoryMovements: CreateInventoryMovementParams[] = [];
    const itemUpdates: any[] = []; // Promises to update RestockOrderItems

    // Create a map for quick lookup of existing order items
    // Keyed by ITEM ID, not Product ID, to handle duplicates correctly.
    const orderItemsMap = new Map(order.items.map((i) => [i.id, i]));

    for (const receivedItem of receivedItems) {
      const { restockOrderItemId, quantityReceived, cost } = receivedItem;

      const orderItem = orderItemsMap.get(restockOrderItemId);
      if (!orderItem) {
        continue;
      }

      if (quantityReceived <= 0) continue;

      // Calculate Landed Cost Factor based on Total Order Value
      const totalOrderValue = order.totalAmount || 1; // Prevent div/0
      const shippingCost = order.shippingCost || 0;
      const landedFactor = 1 + shippingCost / totalOrderValue;

      const baseUnitCost = cost || orderItem.cost;
      const landedUnitCost = baseUnitCost * landedFactor;

      // 1. Prepare Inventory Movement
      inventoryMovements.push({
        storeId: params.storeId,
        productId: orderItem.productId, // Use product ID from the item record
        type: "RESTOCK_RECEIVED",
        quantity: quantityReceived,
        reason: `Recepcion Orden de Compra #${order.orderNumber}`,
        referenceId: order.id,
        cost: landedUnitCost,
        createdBy: `USER_${userId}`,
      });
    }

    if (inventoryMovements.length === 0) {
      throw ErrorFactory.InvalidRequest("No valid items to receive");
    }

    // Execute Transaction for Atomicity
    await prismadb.$transaction(async (tx) => {
      // Step 1: Update all RestockOrderItems
      for (const receivedItem of receivedItems) {
        const { restockOrderItemId, quantityReceived } = receivedItem;
        const orderItem = orderItemsMap.get(restockOrderItemId);

        if (orderItem && quantityReceived > 0) {
          await tx.restockOrderItem.update({
            where: { id: restockOrderItemId },
            data: {
              quantityReceived: { increment: quantityReceived },
            },
          });
        }
      }

      // Step 2: Inventory Movements
      // Use the batch helper with the transaction client
      // This will create movements AND update Product stock
      await createInventoryMovementBatch(tx, inventoryMovements);

      // Step 3: Determine New Status
      // Fetch fresh state of items INSIDE the transaction to verify totals
      const freshOrder = await tx.restockOrder.findUnique({
        where: { id: params.orderId },
        include: { items: true },
      });

      if (freshOrder) {
        const allReceived = freshOrder.items.every(
          (i) => i.quantityReceived >= i.quantity,
        );
        const someReceived = freshOrder.items.some(
          (i) => i.quantityReceived > 0,
        );

        let newStatus = freshOrder.status; // Use current status from DB

        // Logic:
        // If everything is met -> COMPLETED
        // If some met -> PARTIALLY_RECEIVED (unless already completed? No, if we receive more, it remains completed)
        // Actually, if we over-receive, it is still completed.

        if (allReceived) {
          newStatus = "COMPLETED"; // Matches schema Enum
        } else if (someReceived) {
          newStatus = "PARTIALLY_RECEIVED";
        }

        if (newStatus !== freshOrder.status) {
          await tx.restockOrder.update({
            where: { id: params.orderId },
            data: { status: newStatus },
          });
        }
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: "Items received and inventory updated",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.log("[RESTOCK_ORDER_RECEIVE]", error);
    return handleErrorResponse(error, "RESTOCK_ORDER_RECEIVE", {
      headers: corsHeaders,
    });
  }
}
