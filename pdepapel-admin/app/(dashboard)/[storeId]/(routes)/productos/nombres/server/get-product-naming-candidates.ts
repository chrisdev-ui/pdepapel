"use server";

import prismadb from "@/lib/prismadb";

export async function getProductNamingCandidates(storeId: string) {
  const [products, groups, recentChanges] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, isArchived: false },
      select: {
        id: true,
        name: true,
        sku: true,
        brand: true,
        productGroup: { select: { name: true } },
        category: { select: { name: true } },
        color: { select: { name: true } },
        size: { select: { name: true } },
        design: { select: { name: true } },
        images: {
          select: { url: true },
          orderBy: { isMain: "desc" },
          take: 1,
        },
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
    prismadb.productGroup.findMany({
      where: {
        storeId,
        products: { some: { isArchived: false } },
      },
      select: {
        id: true,
        name: true,
        brand: true,
        images: {
          select: { url: true },
          orderBy: { isMain: "desc" },
          take: 1,
        },
        products: {
          where: { isArchived: false },
          select: {
            category: { select: { name: true } },
          },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prismadb.productNamingChange.findMany({
      where: { storeId },
      select: {
        id: true,
        entityType: true,
        previousName: true,
        nextName: true,
        createdAt: true,
        revertedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      categoryName: product.category.name,
      colorName: product.color.name,
      sizeName: product.size.name,
      designName: product.design.name,
      groupName: product.productGroup?.name ?? null,
      imageUrl: product.images[0]?.url ?? null,
    })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      brand: group.brand,
      categoryName: group.products[0]?.category.name ?? null,
      imageUrl: group.images[0]?.url ?? null,
    })),
    recentChanges: recentChanges.map((change) => ({
      ...change,
      entityType: change.entityType as "PRODUCT" | "PRODUCT_GROUP",
      createdAt: change.createdAt.toISOString(),
      revertedAt: change.revertedAt?.toISOString() ?? null,
    })),
  };
}
