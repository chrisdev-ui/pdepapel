import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import {
  REVIEW_ACTION_LABELS,
  moderateReview,
  parseReviewModerationBody,
  reviewRevalidationPaths,
} from "@/lib/review-moderation";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Moderación de reseñas desde el panel (solo dueño de la tienda):
 * `{ action: "hide" | "publish" | "reply" | "clearReply", reply?, note? }`.
 * El cliente sigue editando su propia reseña por
 * `/api/[storeId]/products/[productId]/reviews/[reviewId]`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; reviewId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.reviewId) throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");

    await verifyStoreOwner(userId, params.storeId);

    const input = parseReviewModerationBody(await req.json().catch(() => ({})));
    const review = await moderateReview(prismadb, {
      storeId: params.storeId,
      reviewId: params.reviewId,
      userId,
      input,
    });

    await triggerStorefrontRevalidation({
      productId: review.productId,
      paths: reviewRevalidationPaths(review.product.slug),
      tags: ["products"],
    });

    return NextResponse.json(
      {
        message: REVIEW_ACTION_LABELS[input.action],
        review: {
          id: review.id,
          status: review.status,
          reply: review.reply,
          repliedAt: review.repliedAt,
          moderatedAt: review.moderatedAt,
        },
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_MODERATION_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
