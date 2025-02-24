"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getOrder(orderId: string, storeId: string) {
  headers();
  const order = await prismadb.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      orderItems: true,
      payment: true,
      shipping: true,
      coupon: true,
    },
  });

  const products = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
      stock: {
        gte: 1,
      },
    },
    select: {
      id: true,
      name: true,
      price: true,
      images: {
        select: {
          url: true,
          isMain: true,
        },
        orderBy: {
          isMain: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return {
    order,
    products: products.map((product) => ({
      value: product.id,
      label: product.name,
      price: product.price,
      image: product.images[0]?.url || "",
    })),
  };
}
