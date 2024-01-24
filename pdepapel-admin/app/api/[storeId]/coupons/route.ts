import { getUserId, isUserAuthorized } from "@/helpers/auth";
import {
  createNewCoupon,
  getCouponsByStoreId,
} from "@/helpers/coupons-actions";
import { handleErrorResponse } from "@/helpers/response";
import { validateMandatoryFields } from "@/helpers/validation";
import { CouponBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
}

export async function POST(req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
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
    const coupon = await createNewCoupon({
      ...body,
      storeId: params.storeId,
    });
    return NextResponse.json(coupon);
  } catch (error) {
    console.log("[COUPONS_POST]", error);
    return handleErrorResponse("[COUPONS_POST_ERROR]", 500);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  try {
    const coupons = await getCouponsByStoreId(params.storeId);
    return NextResponse.json(coupons);
  } catch (error) {
    console.log("[COUPONS_GET]", error);
    return handleErrorResponse("[COUPONS_GET_ERROR]", 500);
  }
}
