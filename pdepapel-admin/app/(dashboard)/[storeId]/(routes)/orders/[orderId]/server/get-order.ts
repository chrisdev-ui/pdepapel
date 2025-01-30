"use server";

import prismadb from "@/lib/prismadb";

export async function getOrder(orderId: string, storeId: string) {
  const order = await prismadb.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      orderItems: true,
      payment: true,
      shipping: true,
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
    })),
  };
}
