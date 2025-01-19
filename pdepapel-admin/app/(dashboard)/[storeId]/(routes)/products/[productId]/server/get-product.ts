"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getProduct(id: string, storeId: string) {
  const product = await prismadb.product.findUnique({
    where: {
      id,
    },
    include: {
      images: true,
      reviews: true,
    },
  });
  const categories = await prismadb.category.findMany({
    where: {
      storeId,
    },
    include: {
      type: true,
    },
  });
  const sizes = await prismadb.size.findMany({
    where: {
      storeId,
    },
  });
  const colors = await prismadb.color.findMany({
    where: {
      storeId,
    },
  });
  const designs = await prismadb.design.findMany({
    where: {
      storeId,
    },
  });
  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId,
    },
  });

  const reviews =
    product?.reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      name: review.name,
      userId: review.userId,
      rating: String(review.rating),
      comment: review.comment || "",
      createdAt: format(product.createdAt, "dd 'de' MMMM 'de' yyyy", {
        locale: es,
      }),
    })) || [];

  return {
    product,
    categories,
    sizes,
    colors,
    designs,
    suppliers,
    reviews,
  };
}
