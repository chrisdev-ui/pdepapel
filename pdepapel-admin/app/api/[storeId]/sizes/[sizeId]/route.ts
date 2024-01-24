import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import {
  deleteSizeById,
  getSizeById,
  updateSizeById,
} from "@/helpers/sizes-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { SizeBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  sizeId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.sizeId) return handleErrorResponse("Size ID is required", 400);
  try {
    const size = await getSizeById(params.sizeId);
    return NextResponse.json(size);
  } catch (error) {
    console.log("[SIZE_GET]", error);
    return handleErrorResponse("[SIZE_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.sizeId) return handleErrorResponse("Size ID is required", 400);
  try {
    const body: SizeBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "value"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const size = await updateSizeById(params.sizeId, body);
    return NextResponse.json(size);
  } catch (error) {
    console.log("[SIZE_PATCH]", error);
    return handleErrorResponse("[SIZE_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.sizeId) return handleErrorResponse("Size ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteSizeById(params.sizeId);
    return handleSuccessResponse("Size was successfully deleted!");
  } catch (error) {
    console.log("[SIZE_DELETE]", error);
    return handleErrorResponse("[SIZE_DELETE_ERROR]", 500);
  }
}
