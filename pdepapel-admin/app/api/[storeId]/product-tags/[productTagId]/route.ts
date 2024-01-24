import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteProductTagById,
  getProductTagById,
  updateProductTagById,
} from "@/helpers/product-tags-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductTagBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  productTagId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productTagId)
    return handleErrorResponse("ProductTag ID is required", 400);
  try {
    const productTag = await getProductTagById(params.productTagId);
    return NextResponse.json(productTag);
  } catch (error) {
    console.log("[PRODUCT_TAG_GET]", error);
    return handleErrorResponse("[PRODUCT_TAG_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productTagId)
    return handleErrorResponse("ProductTag ID is required", 400);
  try {
    const body: ProductTagBody = await req.json();
    const missingFields = validateMandatoryFields(body, ["productId", "tagId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const productTag = await updateProductTagById(params.productTagId, body);
    return NextResponse.json(productTag);
  } catch (error) {
    console.log("[PRODUCT_TAG_PATCH]", error);
    return handleErrorResponse("[PRODUCT_TAG_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productTagId)
    return handleErrorResponse("ProductTag ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteProductTagById(params.productTagId);
    return handleSuccessResponse("ProductTag was successfully deleted!");
  } catch (error) {
    console.log("[PRODUCT_TAG_DELETE]", error);
    return handleErrorResponse("[PRODUCT_TAG_DELETE_ERROR]", 500);
  }
}
