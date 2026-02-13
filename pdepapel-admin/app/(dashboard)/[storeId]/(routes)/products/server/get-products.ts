"use server";

import prismadb from "@/lib/prismadb";

export async function getProducts(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      categoryId: true,
      sku: true,
      name: true,
      price: true,
      stock: true,
      color: true,
      isArchived: true,
      isFeatured: true,
      productGroupId: true,
      isKit: true,
      kitComponents: {
        select: {
          quantity: true,
          component: {
            select: { stock: true },
          },
        },
      },
      images: {
        select: {
          url: true,
          isMain: true,
        },
        take: 1,
        orderBy: {
          isMain: "desc",
        },
      },
      category: {
        select: {
          name: true,
        },
      },
      size: {
        select: {
          name: true,
        },
      },
      design: {
        select: {
          name: true,
        },
      },
      productGroup: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Calculate discounted prices
  const { getProductsPrices } = await import("@/lib/discount-engine");
  const pricesMap = await getProductsPrices(products, storeId);

  // Merge discount information with products
  return products.map((product) => {
    const priceInfo = pricesMap.get(product.id);

    // For kit products, compute effective stock from components
    let effectiveStock = product.stock;
    if (product.isKit && product.kitComponents.length > 0) {
      effectiveStock = Math.min(
        ...product.kitComponents.map((c) =>
          c.quantity > 0 ? Math.floor(c.component.stock / c.quantity) : 0,
        ),
      );
      if (effectiveStock < 0) effectiveStock = 0;
    }

    return {
      ...product,
      stock: effectiveStock,
      discountedPrice: priceInfo?.price ?? product.price,
      offerLabel: priceInfo?.offerLabel,
      hasDiscount: priceInfo ? priceInfo.price < product.price : false,
    };
  });
}
