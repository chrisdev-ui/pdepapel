import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import {
  deleteTagById,
  getTagById,
  updateTagById,
} from "@/helpers/tags-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { TagBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  tagId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.tagId) return handleErrorResponse("Tag ID is required", 400);
  try {
    const tag = await getTagById(params.tagId);
    return NextResponse.json(tag);
  } catch (error) {
    console.log("[TAG_GET]", error);
    return handleErrorResponse("[TAG_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.tagId) return handleErrorResponse("Tag ID is required", 400);
  try {
    const body: TagBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const tag = await updateTagById(params.tagId, body);
    return NextResponse.json(tag);
  } catch (error) {
    console.log("[TAG_PATCH]", error);
    return handleErrorResponse("[TAG_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.tagId) return handleErrorResponse("Tag ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteTagById(params.tagId);
    return handleSuccessResponse("Tag was successfully deleted!");
  } catch (error) {
    console.log("[TAG_DELETE]", error);
    return handleErrorResponse("[TAG_DELETE_ERROR]", 500);
  }
}
