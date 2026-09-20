"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { scrubReview } from "@/lib/viewer-payloads";
import { clerkClient, type User } from "@clerk/nextjs/server";

export async function getReviews(storeId: string) {
  const access = await requireStoreRead(storeId);
  const reviews = await prismadb.review.findMany({
    where: {
      storeId,
    },
    include: {
      product: {
        select: {
          name: true,
          slug: true,
          images: { select: { url: true, isMain: true } },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!reviews.length) return [];

  const users: User[] = await (await clerkClient()).users
    .getUserList()
    .then((response) => response.data)
    .catch(() => []);

  return reviews.map((review) => {
    const user = users.find((user) => user.id === review.userId);
    const userImage = user?.hasImage ? user.imageUrl : undefined;
    const row = {
      id: review.id,
      productId: review.productId,
      productSlug: review.product.slug,
      productImage:
        review.product.images.find((image) => image.isMain)?.url ??
        review.product.images[0]?.url ??
        "https://placehold.co/400",
      productName: review.product.name,
      userId: review.userId,
      userImage,
      name: review.name,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      moderationNote: review.moderationNote,
      reply: review.reply,
      repliedAt: review.repliedAt,
      createdAt: review.createdAt,
    };
    // El nombre de quien reseña ya se ve en la tienda; la nota de moderación no.
    return access.role === "viewer" ? scrubReview(row) : row;
  });
}
