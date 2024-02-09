import { SEARCH_QUERY_PARAMS_CONFIG } from "@/constants";
import {
  parseQueryParams,
  searchProductsByTerm,
} from "@/helpers/product-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const { page, limit, search } = parseQueryParams(
      req.url,
      SEARCH_QUERY_PARAMS_CONFIG,
    );
    const products = await searchProductsByTerm(
      search,
      params.storeId,
      page,
      limit,
    );
    return handleSuccessResponse(products);
  } catch (error) {
    console.log("[SEARCH_PRODUCTS]", error);
    return handleErrorResponse("[SEARCH_PRODUCTS_ERROR]", 500);
  }
}
