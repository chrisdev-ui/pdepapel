import { NextResponse } from "next/server";

import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewProduct,
  fetchFilteredProducts,
  parseQueryParams,
} from "@/helpers/product-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { ProductBody } from "@/lib/types";
import { generateRandomSKU } from "@/lib/utils";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
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
    const sku = generateRandomSKU();
    const product = await createNewProduct({
      ...body,
      sku,
      storeId: params.storeId,
    });
    return NextResponse.json(product);
  } catch (error) {
    console.log("[PRODUCTS_POST]", error);
    return handleErrorResponse("[PRODUCTS_POST_ERROR]", 500);
  }
}

export async function GET(req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const queryParams = parseQueryParams(req.url);
    const { itemsPerPage, fromShop } = queryParams;
    const { products, totalItems } = await fetchFilteredProducts(
      queryParams,
      params.storeId,
    );
    const totalPages = fromShop ? Math.ceil(totalItems / itemsPerPage) : 1;
    return NextResponse.json({
      products,
      totalItems,
      totalPages: fromShop ? totalPages : 1,
    });
  } catch (error) {
    console.log("[PRODUCTS_GET]", error);
    return handleErrorResponse("[PRODUCTS_GET_ERROR]", 500);
  }
}
