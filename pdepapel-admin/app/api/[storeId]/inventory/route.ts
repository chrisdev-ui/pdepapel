import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { createInventoryMovement } from "@/lib/inventory";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { resolveInventoryMovementQuantity } from "@/lib/inventory-request";
import { InventoryMovementType } from "@prisma/client";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const {
      productId,
      variantId,
      type,
      action,
      quantity,
      reason,
      description,
      cost,
    } = body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    // Validate request
    if (!productId && !variantId)
      throw ErrorFactory.InvalidRequest("Product or Variant ID required");
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0)
      throw ErrorFactory.InvalidRequest("Create quantity required (non-zero)");

    // Define allowed types for this endpoint
    const allowedTypes = [
      "MANUAL_ADJUSTMENT",
      "DAMAGE",
      "LOST",
      "STORE_USE",
      "PROMOTION",
      "RETURN",
      "PURCHASE",
      "INITIAL_INTAKE", // Allow if needed for manual fix
    ];

    if (!type || !allowedTypes.includes(type)) {
      throw ErrorFactory.InvalidRequest(
        `Invalid movement type. Allowed: ${allowedTypes.join(", ")}`,
      );
    }

    if (action !== undefined && action !== "add" && action !== "subtract") {
      throw ErrorFactory.InvalidRequest("Invalid inventory action");
    }

    // Strict reason requirement
    if (!reason) throw ErrorFactory.InvalidRequest("Reason is required");

    const finalQuantity = resolveInventoryMovementQuantity({
      action,
      quantity: parsedQuantity,
      type,
    });

    const targetProductId = productId || variantId;
    const movement = await prismadb.$transaction((tx) =>
      createInventoryMovement(tx, {
        storeId: params.storeId,
        productId: targetProductId,
        type: type as InventoryMovementType,
        quantity: finalQuantity,
        reason,
        description,
        cost: cost ? parseFloat(cost) : undefined,
        createdBy: `USER_${userId}`,
      }),
    );
    await invalidateStoreProductsCache(params.storeId, targetProductId);

    return NextResponse.json(movement, { headers: corsHeaders });
  } catch (error) {
    console.log("[INVENTORY_POST]", error);
    return handleErrorResponse(error, "INVENTORY_POST", {
      headers: corsHeaders,
    });
  }
}
