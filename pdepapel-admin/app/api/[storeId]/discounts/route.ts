import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewDiscount,
  getDiscountsByStoreId,
} from "@/helpers/discounts-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { DiscountBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
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
    const discount = await createNewDiscount({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(discount);
  } catch (error) {
    console.log("[DISCOUNTS_POST]", error);
    return handleErrorResponse("[DISCOUNTS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const discounts = await getDiscountsByStoreId(params.storeId);
    return NextResponse.json(discounts);
  } catch (error) {
    console.log("[DISCOUNTS_GET]", error);
    return handleErrorResponse("[DISCOUNTS_GET_ERROR]", 500);
  }
}