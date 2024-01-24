import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteDesignById,
  getDesignById,
  updateDesignById,
} from "@/helpers/designs-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { DesignBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  designId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.designId)
    return handleErrorResponse("Design ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const design = await getDesignById(params.designId);
    return NextResponse.json(design);
  } catch (error) {
    console.log("[DESIGN_GET]", error);
    return handleErrorResponse("[DESIGN_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.designId)
    return handleErrorResponse("Design ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: DesignBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const design = await updateDesignById(params.designId, body);
    return NextResponse.json(design);
  } catch (error) {
    console.log("[DESIGN_PATCH]", error);
    return handleErrorResponse("[DESIGN_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.designId)
    return handleErrorResponse("Design ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteDesignById(params.designId);
    return handleSuccessResponse("Design was successfully deleted!");
  } catch (error) {
    console.log("[DESIGN_DELETE]", error);
    return handleErrorResponse("[DESIGN_DELETE_ERROR]", 500);
  }
}
