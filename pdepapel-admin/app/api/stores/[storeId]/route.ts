import { getUserId } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { deleteStoreById, updateStoreById } from "@/helpers/stores-actions";
import { StoreBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: StoreBody = await req.json();
    const store = await updateStoreById(params.storeId, body);
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_PATCH]", error);
    return handleErrorResponse("[STORE_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    await deleteStoreById(params.storeId);
    return handleSuccessResponse("Store was successfully deleted!");
  } catch (error) {
    console.log("[STORE_DELETE]", error);
    return handleErrorResponse("[STORE_DELETE_ERROR]", 500);
  }
}
