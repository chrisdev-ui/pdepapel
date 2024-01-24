import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewProductTag,
  getProductTagsByStoreId,
} from "@/helpers/product-tags-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductTagBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
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
    const productTag = await createNewProductTag({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(productTag);
  } catch (error) {
    console.log("[PRODUCT_TAGS_POST]", error);
    return handleErrorResponse("[PRODUCT_TAGS_POST_ERROR]", 500);
  }
}

export async function GET({ params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const productTags = await getProductTagsByStoreId(params.storeId);
    return NextResponse.json(productTags);
  } catch (error) {
    console.log("[PRODUCT_TAGS_GET]", error);
    return handleErrorResponse("[PRODUCT_TAGS_GET_ERROR]", 500);
  }
}
