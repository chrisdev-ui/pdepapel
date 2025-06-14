import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { clerkClient } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    const body = await req.json();
    const { rating, comment, userId } = body;

    if (!userId)
      throw ErrorFactory.InvalidRequest("El ID del usuario es requerido");

    const user = await clerkClient.users.getUser(userId).catch(() => null);
    if (!user) throw ErrorFactory.Unauthenticated();

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      throw ErrorFactory.InvalidRequest(
        "La calificación es requerida y debe estar entre 1 y 5",
      );
    }

    // Verify product exists and belongs to store
    const product = await prismadb.product.findUnique({
      where: {
        id: params.productId,
        storeId: params.storeId,
      },
    });

    if (!product)
      throw ErrorFactory.NotFound(
        `El producto ${params.productId} no existe o no pertenece a esta tienda`,
      );

    // Check if user already reviewed this product
    const existingReview = await prismadb.review.findFirst({
      where: {
        userId,
        productId: params.productId,
      },
    });

    if (existingReview) {
      throw ErrorFactory.InvalidRequest(
        "Ya has realizado una reseña para este producto",
      );
    }

    const review = await prismadb.review.create({
      data: {
        userId,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
        storeId: params.storeId,
        productId: params.productId,
        rating,
        comment: comment ?? "",
      },
    });
    return NextResponse.json(review, { status: 200, headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "REVIEWS_POST", { headers: corsHeaders });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    // Verify product exists and belongs to store
    const product = await prismadb.product.findUnique({
      where: {
        id: params.productId,
        storeId: params.storeId,
      },
    });

    if (!product)
      throw ErrorFactory.NotFound(
        `El producto ${params.productId} no existe o no pertenece a esta tienda`,
      );

    const reviews = await prismadb.review.findMany({
      where: { storeId: params.storeId, productId: params.productId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(reviews, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "REVIEWS_GET", {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  }
}
