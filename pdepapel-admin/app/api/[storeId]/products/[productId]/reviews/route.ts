import { getUserById } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import {
  createNewReview,
  getReviewsOfProductByStore,
} from "@/helpers/reviews-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { ReviewBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  productId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request, { params }: { params: Params }) {
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400, corsHeaders);
  try {
    const body: ReviewBody = await req.json();
    const { userId, ...bodyWithoutUserId } = body;
    const missingFields = validateMandatoryFields(body, ["rating", "userId"]);
    if (missingFields)
      return handleErrorResponse(
        `Missing mandatory fields: ${missingFields.join(", ")}`,
        400,
        corsHeaders,
      );
    const user = await getUserById(userId);
    if (!user) return handleErrorResponse("User not found", 404);
    const review = await createNewReview(user, {
      ...bodyWithoutUserId,
      storeId: params.storeId,
      productId: params.productId,
    });
    return handleSuccessResponse(review, 200, corsHeaders);
  } catch (error) {
    console.log("[REVIEWS_POST]", error);
    return handleErrorResponse("[REVIEWS_POST_ERROR]", 500, corsHeaders);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  try {
    const reviews = await getReviewsOfProductByStore(
      params.storeId,
      params.productId,
    );
    return NextResponse.json(reviews);
  } catch (error) {
    console.log("[REVIEWS_GET]", error);
    return handleErrorResponse("[REVIEWS_GET_ERROR]", 500);
  }
}
