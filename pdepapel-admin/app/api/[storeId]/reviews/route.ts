import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { PUBLIC_REVIEW_SELECT, PUBLIC_REVIEW_WHERE } from "@/lib/review-moderation";
import { CACHE_HEADERS } from "@/lib/utils";

const MAX_LIMIT = 12;

// Reseñas publicadas de la tienda para la portada: las más recientes con su
// producto, más la nota media y el total. Las de productos archivados cuentan
// (la opinión sigue siendo real); la tienda solo omite el enlace al producto.
export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const requested = Number(new URL(req.url).searchParams.get("limit"));
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : 9;
    const where = { storeId: params.storeId, ...PUBLIC_REVIEW_WHERE };

    const [reviews, summary] = await Promise.all([
      prismadb.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          ...PUBLIC_REVIEW_SELECT,
          product: {
            select: { id: true, name: true, slug: true, isArchived: true, images: { where: { isMain: true }, take: 1, select: { url: true } } },
          },
        },
      }),
      prismadb.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
    ]);

    return NextResponse.json(
      {
        reviews: reviews.map(({ product, ...review }) => ({
          ...review,
          product: { id: product.id, name: product.name, slug: product.slug, isArchived: product.isArchived, imageUrl: product.images[0]?.url ?? null },
        })),
        summary: { average: summary._avg.rating ? Math.round(summary._avg.rating * 10) / 10 : null, count: summary._count._all },
      },
      { headers: CACHE_HEADERS.DYNAMIC },
    );
  } catch (error) {
    return handleErrorResponse(error, "REVIEWS_GET");
  }
}
