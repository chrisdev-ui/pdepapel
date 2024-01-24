import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import {
  deleteProductVariantById,
  getProductVariantById,
  updateProductVariantAndStock,
} from "@/helpers/product-variants-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductVariantBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  productVariantId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.productVariantId)
    return handleErrorResponse("Product Variant ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const productVariant = await getProductVariantById(
      params.productVariantId,
      {},
      true,
    );
    return NextResponse.json(productVariant);
  } catch (error) {
    console.log("[PRODUCT_VARIANT_GET]", error);
    return handleErrorResponse("[PRODUCT_VARIANT_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productVariantId)
    return handleErrorResponse("Product Variant ID is required", 400);
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
    const variantToUpdate = await getProductVariantById(
      params.productVariantId,
      {
        images: true,
      },
    );
    if (!variantToUpdate)
      return handleErrorResponse("Product Variant not found", 404);
    const updatedProductVariant = await updateProductVariantAndStock(
      variantToUpdate.images,
      body,
      params.productVariantId,
    );
    return NextResponse.json(updatedProductVariant);
  } catch (error) {
    console.log("[PRODUCT_VARIANT_PATCH]", error);
    return handleErrorResponse("[PRODUCT_VARIANT_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productVariantId)
    return handleErrorResponse("Product Variant ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const productVariantToDelete = await getProductVariantById(
      params.productVariantId,
      { images: true },
    );
    if (!productVariantToDelete)
      return handleErrorResponse("Product Variant not found", 404);
    const publicIds = productVariantToDelete.images.map(
      (image) => getPublicId(image.url) ?? "",
    );
    if (publicIds.length > 0) await deleteResources(publicIds);
    await deleteProductVariantById(params.productVariantId);
    return handleSuccessResponse("Product Variant was successfully deleted!");
  } catch (error) {
    console.log("[PRODUCT_VARIANT_DELETE]", error);
    return handleErrorResponse("[PRODUCT_VARIANT_DELETE_ERROR]", 500);
  }
}
