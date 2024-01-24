import { getUserById, getUserId, isUserAuthorized } from "@/helpers/auth";
import { handleErrorResponse, handleSuccessResponse } from "@/helpers/response";
import {
  deleteReviewById,
  getReviewById,
  getReviewOfProductById,
  updateReviewById,
} from "@/helpers/reviews-actions";
import { validateMandatoryFields } from "@/helpers/validation";
import { ReviewBody } from "@/lib/types";
import { NextResponse } from "next/server";

interface Params {
  storeId: string;
  productId: string;
  reviewId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(_req: Request, { params }: { params: Params }) {
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  if (!params.reviewId)
    return handleErrorResponse("Review ID is required", 400);
  try {
    const review = await getReviewById(params.reviewId);
    if (!review) return handleErrorResponse("Review ID is required", 400);
    return NextResponse.json(review);
  } catch (error) {
    console.log("[REVIEW_GET]", error);
    return handleErrorResponse("[REVIEW_GET_ERROR]", 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  if (!params.storeId)
    return handleErrorResponse("Store ID is required", 400, corsHeaders);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400, corsHeaders);
  if (!params.reviewId)
    return handleErrorResponse("Review ID is required", 400, corsHeaders);
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
    if (!user) return handleErrorResponse("User not found", 404, corsHeaders);
    const existingReview = await getReviewById(params.reviewId);
    if (!existingReview)
      return handleErrorResponse("Review not found", 404, corsHeaders);
    if (existingReview.userId !== userId)
      return handleErrorResponse("Unauthorized", 403, corsHeaders);
    const updatedReview = await updateReviewById(
      user,
      params.reviewId,
      params.productId,
      bodyWithoutUserId,
    );
    return handleSuccessResponse(updatedReview, 200, corsHeaders);
  } catch (error) {
    console.log("[REVIEW_PATCH]", error);
    return handleErrorResponse("[REVIEW_PATCH_ERROR]", 500, corsHeaders);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const userId = getUserId();
  if (!userId) return handleErrorResponse("Unauthenticated", 401);
  if (!params.storeId) return handleErrorResponse("Store ID is required", 400);
  if (!params.productId)
    return handleErrorResponse("Product ID is required", 400);
  if (!params.reviewId)
    return handleErrorResponse("Review ID is required", 400);
  try {
    const reviewToDelete = await getReviewOfProductById(
      params.productId,
      params.reviewId,
    );
    if (!reviewToDelete) return handleErrorResponse("Review not found", 404);
    const isAuthor = userId === reviewToDelete.userId;
    const isAuthorized = await isUserAuthorized(userId, params.storeId);
    if (!isAuthorized && !isAuthor)
      return handleErrorResponse("Unauthorized", 403);
    await deleteReviewById(params.reviewId);
    return handleSuccessResponse("Review was successfully deleted!");
  } catch (error) {
    console.log("[REVIEW_DELETE]", error);
    return handleErrorResponse("[REVIEW_DELETE_ERROR]", 500);
  }
}
