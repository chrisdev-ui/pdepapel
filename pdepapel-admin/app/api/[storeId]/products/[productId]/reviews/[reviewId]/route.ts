import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { auth, clerkClient } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  _req: Request,
  {
    params,
  }: { params: { storeId: string; productId: string; reviewId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    if (!params.reviewId)
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");

    const review = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        storeId: params.storeId,
        productId: params.productId,
      },
    });

    if (!review) throw ErrorFactory.NotFound("Reseña no encontrada");

    return NextResponse.json(review);
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_GET");
  }
}

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: { storeId: string; productId: string; reviewId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId) {
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    }
    if (!params.reviewId) {
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");
    }

    const body = await req.json();
    const { rating, comment, userId } = body;
    const user = await clerkClient.users.getUser(userId);

    if (!user) throw ErrorFactory.Unauthenticated();

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      throw ErrorFactory.InvalidRequest(
        "La calificación debe estar entre 1 y 5",
      );
    }

    // Verify review exists and user ownership
    const existingReview = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        productId: params.productId,
      },
    });

    if (!existingReview) {
      throw ErrorFactory.NotFound("Reseña no encontrada");
    }

    // Only allow review author to update
    if (existingReview.userId !== userId) {
      throw ErrorFactory.Unauthorized();
    }

    const updatedReview = await prismadb.review.update({
      where: {
        id: params.reviewId,
      },
      data: {
        ...(rating !== undefined && { rating }),
        ...(comment !== undefined && { comment }),
      },
    });

    return NextResponse.json(updatedReview, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_PATCH", { headers: corsHeaders });
  }
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: { storeId: string; reviewId: string; productId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId) {
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    }
    if (!params.reviewId) {
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");
    }

    // Verify store ownership or review ownership
    const review = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        productId: params.productId,
      },
      include: {
        store: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (!review) throw ErrorFactory.NotFound("Reseña no encontrada");

    // Check if user is store owner or review author
    if (review.store.userId !== userId && review.userId !== userId) {
      throw ErrorFactory.Unauthorized();
    }

    const deletedReview = await prismadb.review.delete({
      where: { id: params.reviewId },
    });

    return NextResponse.json(deletedReview);
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_DELETE");
  }
}
