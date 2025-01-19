"use server";

import prismadb from "@/lib/prismadb";
import { clerkClient } from "@clerk/nextjs";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getReviews(storeId: string) {
  const reviews = await prismadb.review.findMany({
    where: {
      storeId,
    },
    include: {
      product: {
        include: {
          images: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!reviews.length) return [];

  const users = await clerkClient.users.getUserList();

  return reviews.map((review) => {
    const user = users.find((user) => user.id === review.userId);
    const userImage = user?.hasImage ? user.imageUrl : undefined;
    return {
      id: review.id,
      productId: review.productId,
      productImage:
        review.product.images.find((image) => image.isMain)?.url ??
        review.product.images[0].url,
      productName: review.product.name,
      userId: review.userId,
      userImage,
      name: review.name,
      rating: String(review.rating),
      comment: review.comment,
      createdAt: format(review.createdAt, "dd 'de' MMMM 'de' yyyy", {
        locale: es,
      }),
    };
  });
}
