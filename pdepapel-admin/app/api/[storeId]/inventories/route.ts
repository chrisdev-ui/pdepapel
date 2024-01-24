import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewInventory,
  getInventoriesByStoreId,
} from "@/helpers/inventories-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { InventoryBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
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
    const inventory = await createNewInventory({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(inventory);
  } catch (error) {
    console.log("[INVENTORIES_POST]", error);
    return handleErrorResponse("[INVENTORIES_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const inventories = await getInventoriesByStoreId(params.storeId);
    return NextResponse.json(inventories);
  } catch (error) {
    console.log("[INVENTORIES_GET]", error);
    return handleErrorResponse("[INVENTORIES_GET_ERROR]", 500);
  }
}
