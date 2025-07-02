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

  const availableProducts = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
      stock: {
        gt: 0,
      },
    },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
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

  type ExistingOrderProduct = (typeof availableProducts)[0] & {
    isArchived: boolean;
  };

  let existingOrderProducts: ExistingOrderProduct[] = [];
  if (order && order.orderItems.length > 0) {
    const existingProductIds = order.orderItems.map((item) => item.productId);

    existingOrderProducts = await prismadb.product.findMany({
      where: {
        id: {
          in: existingProductIds,
        },
        storeId,
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isArchived: true,
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
    });
  }

  type ProductOption = {
    value: string;
    label: string;
    price: number;
    stock: number;
    image: string;
    isAvailable: boolean;
    isArchived: boolean;
  };

  const allProductsMap = new Map<string, ProductOption>();

  availableProducts.forEach((product) => {
    allProductsMap.set(product.id, {
      value: product.id,
      label: product.name,
      price: product.price,
      stock: product.stock,
      image: product.images[0]?.url || "",
      isAvailable: true,
      isArchived: false,
    });
  });

  existingOrderProducts.forEach((product) => {
    const isAvailable = !product.isArchived && product.stock > 0;
    const label = product.isArchived
      ? `${product.name} (Archivado)`
      : product.stock === 0
        ? `${product.name} (Sin stock)`
        : product.name;

    allProductsMap.set(product.id, {
      value: product.id,
      label,
      price: product.price,
      stock: product.stock,
      image: product.images[0]?.url || "",
      isAvailable,
      isArchived: product.isArchived,
    });
  });

  const products = Array.from(allProductsMap.values()).sort((a, b) => {
    // Sort available products first, then by name
    if (a.isAvailable && !b.isAvailable) return -1;
    if (!a.isAvailable && b.isAvailable) return 1;
    return a.label.localeCompare(b.label);
  });

  return {
    order,
    products,
  };
}

export type GetOrderResult = Awaited<ReturnType<typeof getOrder>>;
export type ProductOption = GetOrderResult["products"][0];
