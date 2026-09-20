"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { scrubProduct } from "@/lib/viewer-payloads";

export async function getProducts(storeId: string) {
  const access = await requireStoreRead(storeId);
  const products = await prismadb.product.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      categoryId: true,
      sku: true,
      slug: true,
      name: true,
      price: true,
      acqPrice: true,
      gtin: true,
      hasNoProductIdentifier: true,
      stock: true,
      color: true,
      isArchived: true,
      isFeatured: true,
      availableAt: true,
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
      _count: {
        select: {
          images: { where: { brokenAt: { not: null } } },
          kitComponents: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      size: {
        select: {
          id: true,
          name: true,
        },
      },
      design: {
        select: {
          id: true,
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

    // Una cuenta de solo lectura ve el catálogo sin el costo de compra.
    const visible = access.role === "viewer" ? scrubProduct(product) : product;

    return {
      ...visible,
      brokenImages: product._count.images,
      stock: effectiveStock,
      discountedPrice: priceInfo?.price ?? product.price,
      offerLabel: priceInfo?.offerLabel,
      hasDiscount: priceInfo ? priceInfo.price < product.price : false,
    };
  });
}
