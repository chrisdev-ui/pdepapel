import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/db-utils";
import { createInventoryMovement } from "@/lib/inventory";
import { InventoryMovementType } from "@prisma/client";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;

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

    const { productId, variantId, type, quantity, reason, description, cost } =
      body;

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    // Validate request
    if (!productId && !variantId)
      throw ErrorFactory.InvalidRequest("Product or Variant ID required");
    if (quantity === undefined || quantity === null || quantity === 0)
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

    // Strict reason requirement
    if (!reason) throw ErrorFactory.InvalidRequest("Reason is required");

    // Logic to ensure correct sign based on type
    let finalQuantity = quantity;

    // These types are strictly decrements (subtract stock)
    const decrementTypes = ["DAMAGE", "LOST", "STORE_USE", "PROMOTION"];
    if (decrementTypes.includes(type)) {
      finalQuantity = -Math.abs(quantity); // Always negative
    }

    // These types are strictly increments (add stock)
    const incrementTypes = ["RETURN", "PURCHASE", "INITIAL_INTAKE"];
    if (incrementTypes.includes(type)) {
      finalQuantity = Math.abs(quantity); // Always positive
    }

    // MANUAL_ADJUSTMENT trusts the sign sent by user (can be + or -)

    // Use helper to create movement
    const movement = await createInventoryMovement(prismadb, {
      storeId: params.storeId,
      productId: productId || undefined,
      type: type as InventoryMovementType,
      quantity: finalQuantity,
      reason: reason,
      description: description,
      cost: cost ? parseFloat(cost) : undefined,
      createdBy: `USER_${userId}`,
    });

    return NextResponse.json(movement, { headers: corsHeaders });
  } catch (error) {
    console.log("[INVENTORY_POST]", error);
    return handleErrorResponse(error, "INVENTORY_POST", {
      headers: corsHeaders,
    });
  }
}
