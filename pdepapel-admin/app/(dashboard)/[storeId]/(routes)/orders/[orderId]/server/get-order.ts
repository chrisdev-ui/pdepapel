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
      categoryId: true,
      name: true,
      price: true,
      stock: true,
      productGroupId: true,
      sku: true,
      size: {
        select: {
          name: true,
        },
      },
      color: {
        select: {
          name: true,
        },
      },
      design: {
        select: {
          name: true,
        },
      },
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
    const existingProductIds = order.orderItems.map(
      (item: { productId: string }) => item.productId,
    );

    existingOrderProducts = await prismadb.product.findMany({
      where: {
        id: {
          in: existingProductIds,
        },
        storeId,
      },
      select: {
        id: true,
        categoryId: true,
        name: true,
        price: true,
        stock: true,
        productGroupId: true,
        isArchived: true,
        sku: true,
        size: {
          select: {
            name: true,
          },
        },
        color: {
          select: {
            name: true,
          },
        },
        design: {
          select: {
            name: true,
          },
        },
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

  // Calculate discounted prices for all products
  const { getProductsPrices } = await import("@/lib/discount-engine");
  const allProducts = [...availableProducts, ...existingOrderProducts];
  const pricesMap = await getProductsPrices(allProducts, storeId);

  type ProductOption = {
    value: string;
    label: string;
    name: string; // Clean name without SKU
    sku: string;
    price: number;
    discountedPrice: number;
    offerLabel?: string;
    stock: number;
    image: string;
    isAvailable: boolean;
    isArchived: boolean;
    size?: string;
    color?: string;
    design?: string;
  };

  const allProductsMap = new Map<string, ProductOption>();

  availableProducts.forEach((product: (typeof availableProducts)[0]) => {
    const priceInfo = pricesMap.get(product.id);

    allProductsMap.set(product.id, {
      value: product.id,
      label: product.name,
      name: product.name,
      sku: product.sku,
      price: product.price,
      discountedPrice: priceInfo?.price ?? product.price,
      offerLabel: priceInfo?.offerLabel ?? undefined,
      stock: product.stock,
      image: product.images[0]?.url || "",
      isAvailable: true,
      isArchived: false,
      size: product.size?.name,
      color: product.color?.name,
      design: product.design?.name,
    });
  });

  existingOrderProducts.forEach((product: ExistingOrderProduct) => {
    const isAvailable = !product.isArchived && product.stock > 0;

    const priceInfo = pricesMap.get(product.id);
    allProductsMap.set(product.id, {
      value: product.id,
      label: product.name,
      name: product.name,
      sku: product.sku,
      price: product.price,
      discountedPrice: priceInfo?.price ?? product.price,
      offerLabel: priceInfo?.offerLabel ?? undefined,
      stock: product.stock,
      image: product.images[0]?.url || "",
      isAvailable,
      isArchived: product.isArchived,
      size: product.size?.name,
      color: product.color?.name,
      design: product.design?.name,
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
