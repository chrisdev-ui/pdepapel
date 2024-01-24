import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  deleteCouponById,
  getCouponById,
  updateCouponById,
} from "@/helpers/coupons-actions";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { CouponBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  couponId: string;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.couponId)
    return handleErrorResponse("Coupon ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const coupon = await getCouponById(params.couponId);
    return NextResponse.json(coupon);
  } catch (error) {
    console.log("[COUPON_GET]", error);
    return handleErrorResponse("[COUPON_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.couponId)
    return handleErrorResponse("Coupon ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const body: CouponBody = await req.json();
    const missingFields = validateMandatoryFields(body, [
      "name",
      "code",
      "type",
      "amount",
      "validFrom",
      "validUntil",
    ]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
      );
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    const coupon = await updateCouponById(params.couponId, body);
    return NextResponse.json(coupon);
  } catch (error) {
    console.log("[COUPON_PATCH]", error);
    return handleErrorResponse("[COUPON_PATCH_ERROR]", 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.couponId)
    return handleErrorResponse("Coupon ID is required", 400);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized) return handleErrorResponse("Unauthorized", 403);
    await deleteCouponById(params.couponId);
    return handleSuccessResponse("Coupon was successfully deleted!");
  } catch (error) {
    console.log("[COUPON_DELETE]", error);
    return handleErrorResponse("[COUPON_DELETE_ERROR]", 500);
  }
}
