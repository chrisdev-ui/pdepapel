import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteCategoryById,
  getCategoryById,
  updateCategoryById,
} from "@/helpers/categories-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { CategoryBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  categoryId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.categoryId)
    return handleErrorResponse("Category ID is required", 400);
  try {
    const category = await getCategoryById(params.categoryId);
    return NextResponse.json(category);
  } catch (error) {
    console.log("[CATEGORY_GET]", error);
    return handleErrorResponse("[CATEGORY_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.categoryId)
    return handleErrorResponse("Category ID is required", 400);
  try {
    const body: CategoryBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["name", "typeId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const category = await updateCategoryById(params.categoryId, body);
    return NextResponse.json(category);
  } catch (error) {
    console.log("[CATEGORY_PATCH]", error);
    return handleErrorResponse("[CATEGORY_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.categoryId)
    return handleErrorResponse("Category ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteCategoryById(params.categoryId);
    return handleSuccessResponse("Category was successfully deleted!");
  } catch (error) {
    console.log("[CATEGORY_DELETE]", error);
    return handleErrorResponse("[CATEGORY_DELETE_ERROR]", 500);
  }
}
