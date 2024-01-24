import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteDiscountById,
  getDiscountById,
  updateDiscountById,
} from "@/helpers/discounts-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { DiscountBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  discountId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.discountId)
    return handleErrorResponse("Discount ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const discount = await getDiscountById(params.discountId);
    return NextResponse.json(discount);
  } catch (error) {
    console.log("[DISCOUNT_GET]", error);
    return handleErrorResponse("[DISCOUNT_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.discountId)
    return handleErrorResponse("Discount ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: DiscountBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "name",
      "amount",
      "type",
      "startDate",
      "endDate",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const discount = await updateDiscountById(params.discountId, body);
    return NextResponse.json(discount);
  } catch (error) {
    console.log("[DISCOUNT_PATCH]", error);
    return handleErrorResponse("[DISCOUNT_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.discountId)
    return handleErrorResponse("Discount ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteDiscountById(params.discountId);
    return handleSuccessResponse("Discount was successfully deleted!");
  } catch (error) {
    console.log("[DISCOUNT_DELETE]", error);
    return handleErrorResponse("[DISCOUNT_DELETE_ERROR]", 500);
  }
}
