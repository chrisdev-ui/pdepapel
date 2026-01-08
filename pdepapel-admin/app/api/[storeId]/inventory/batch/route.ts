import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { createInventoryMovementBatch } from "@/lib/inventory";
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

interface BatchMovement {
  productId: string;
  quantity: number;
  cost?: number;
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const { movements, type, reason, description, supplierId } = body as {
      movements: BatchMovement[];
      type: string;
      reason: string;
      description?: string;
      supplierId?: string;
    };

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    // Validate request
    if (!movements || !Array.isArray(movements) || movements.length === 0) {
      throw ErrorFactory.InvalidRequest("Movements array is required");
    }

    // Define allowed types for batch endpoint
    const allowedTypes = ["INITIAL_INTAKE", "PURCHASE", "MANUAL_ADJUSTMENT"];

    if (!type || !allowedTypes.includes(type)) {
      throw ErrorFactory.InvalidRequest(
        `Invalid movement type. Allowed: ${allowedTypes.join(", ")}`,
      );
    }

    if (!reason) throw ErrorFactory.InvalidRequest("Reason is required");

    // Validate each movement
    for (const m of movements) {
      if (!m.productId) {
        throw ErrorFactory.InvalidRequest(
          "Each movement must have a productId",
        );
      }
      if (m.quantity === undefined || m.quantity === null || m.quantity === 0) {
        throw ErrorFactory.InvalidRequest(
          "Each movement must have a non-zero quantity",
        );
      }
    }

    // Build inventory movement params
    const movementParams = movements.map((m) => ({
      productId: m.productId,
      storeId: params.storeId,
      type: type as InventoryMovementType,
      quantity: Math.abs(m.quantity), // INITIAL_INTAKE and PURCHASE are always positive
      reason,
      description,
      cost: m.cost,
      createdBy: `USER_${userId}`,
    }));

    // Execute batch in transaction
    await prismadb.$transaction(async (tx) => {
      await createInventoryMovementBatch(tx, movementParams, false);
    });

    return NextResponse.json(
      {
        success: true,
        processed: movements.length,
        message: `${movements.length} movimientos de inventario procesados.`,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.log("[INVENTORY_BATCH_POST]", error);
    return handleErrorResponse(error, "INVENTORY_BATCH_POST", {
      headers: corsHeaders,
    });
  }
}
