import { getUserId, isUserAuthorized } from "@/helpers/auth";
import { deleteResources, getPublicId } from "@/helpers/cloudinary";
import {
  deleteProductById,
  getProductById,
  updateProductById,
} from "@/helpers/product-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  productId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  try {
    const product = await getProductById(params.productId, {}, true);
    return NextResponse.json(product);
  } catch (error) {
    console.log("[PRODUCT_GET]", error);
    return handleErrorResponse("[PRODUCT_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  try {
    const body: ProductBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "name",
      "price",
      "categoryId",
      "colorId",
      "sizeId",
      "designId",
      "images",
      "stock",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields or invalid values: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const productToUpdate = await getProductById(params.productId, {
      images: true,
    });
    if (!productToUpdate) return handleErrorResponse("Product not found", 404);
    const updatedProduct = await updateProductById(
      params.productId,
      body,
      productToUpdate.images,
    );
    return NextResponse.json(updatedProduct);
  } catch (error) {
    console.log("[PRODUCT_PATCH]", error);
    return handleErrorResponse("[PRODUCT_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const productToDelete = await getProductById(params.productId, {
      images: true,
    });
    if (!productToDelete) return handleErrorResponse("Product not found", 404);
    const publicIds = productToDelete.images.map(
      (image) => getPublicId(image.url) ?? "",
    );
    if (publicIds.length > 0) await deleteResources(publicIds);
    await deleteProductById(params.productId);
    return handleSuccessResponse("Product was successfully deleted!");
  } catch (error) {
    console.log("[PRODUCT_DELETE]", error);
    return handleErrorResponse("[PRODUCT_DELETE_ERROR]", 500);
  }
}
