import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  getProductVariantsByStoreId,
  registerProductVariantAndStock,
} from "@/helpers/product-variants-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductVariantBody } from "@/lib/types";
import { generateRandomSKU } from "@/lib/utils";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: ProductVariantBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "productId",
      "name",
      "stock",
      "price",
      "images",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields or invalid values: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const sku = generateRandomSKU(body.productId);
    const { productVariant } = await registerProductVariantAndStock({
      ...body,
      sku,
      storeId: params.storeId,
    });
    return NextResponse.json(productVariant);
  } catch (error) {
    console.log("[PRODUCT_VARIANT_POST]", error);
    return handleErrorResponse("[PRODUCT_VARIANT_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const productVariants = await getProductVariantsByStoreId(params.storeId);
    return NextResponse.json(productVariants);
  } catch (error) {
    console.log("[PRODUCT_VARIANTS_GET]", error);
    return handleErrorResponse("[PRODUCT_VARIANTS_GET_ERROR]", 500);
  }
}
