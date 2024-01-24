import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import {
  deleteTypeById,
  getTypeById,
  updateTypeById,
} from "@/helpers/types-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { TypeBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  typeId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.typeId) return handleErrorResponse("Type ID is required", 400);
  try {
    const type = await getTypeById(params.typeId);
    return NextResponse.json(type);
  } catch (error) {
    console.log("[TYPE_GET]", error);
    return handleErrorResponse("[TYPE_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.typeId) return handleErrorResponse("Type ID is required", 400);
  try {
    const body: TypeBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const type = await updateTypeById(params.typeId, body);
    return NextResponse.json(type);
  } catch (error) {
    console.log("[TYPE_PATCH]", error);
    return handleErrorResponse("[TYPE_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.typeId) return handleErrorResponse("Type ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteTypeById(params.typeId);
    return handleSuccessResponse("Type was successfully deleted!");
  } catch (error) {
    console.log("[TYPE_DELETE]", error);
    return handleErrorResponse("[TYPE_DELETE_ERROR]", 500);
  }
}
