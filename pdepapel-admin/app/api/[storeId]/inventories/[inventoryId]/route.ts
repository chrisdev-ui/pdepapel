import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteInventoryById,
  getInventoryById,
  updateInventoryById,
} from "@/helpers/inventories-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { InventoryBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  inventoryId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.inventoryId)
    return handleErrorResponse("Inventory ID is required", 400);
  try {
    const inventory = await getInventoryById(params.inventoryId);
    return NextResponse.json(inventory);
  } catch (error) {
    console.log("[INVENTORY_GET]", error);
    return handleErrorResponse("[INVENTORY_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.inventoryId)
    return handleErrorResponse("Inventory ID is required", 400);
  try {
    const body: InventoryBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["variantId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const inventory = await updateInventoryById(params.inventoryId, body);
    return NextResponse.json(inventory);
  } catch (error) {
    console.log("[INVENTORY_PATCH]", error);
    return handleErrorResponse("[INVENTORY_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.inventoryId)
    return handleErrorResponse("Inventory ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteInventoryById(params.inventoryId);
    return handleSuccessResponse("Inventory was successfully deleted!");
  } catch (error) {
    console.log("[INVENTORY_DELETE]", error);
    return handleErrorResponse("[INVENTORY_DELETE_ERROR]", 500);
  }
}
