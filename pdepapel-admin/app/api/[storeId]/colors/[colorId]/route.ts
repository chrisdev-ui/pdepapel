import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteColorById,
  getColorById,
  updateColorById,
} from "@/helpers/colors-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ColorBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  colorId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.colorId) return handleErrorResponse("Color ID is required", 400);
  try {
    const color = await getColorById(params.colorId);
    return NextResponse.json(color);
  } catch (error) {
    console.log("[COLOR_GET]", error);
    return handleErrorResponse("[COLOR_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.colorId) return handleErrorResponse("Color ID is required", 400);
  try {
    const body: ColorBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "value"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const color = await updateColorById(params.colorId, body);
    return NextResponse.json(color);
  } catch (error) {
    console.log("[COLOR_PATCH]", error);
    return handleErrorResponse("[COLOR_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.colorId) return handleErrorResponse("Color ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteColorById(params.colorId);
    return handleSuccessResponse("Color was successfully deleted!");
  } catch (error) {
    console.log("[COLOR_DELETE]", error);
    return handleErrorResponse("[COLOR_DELETE_ERROR]", 500);
  }
}
