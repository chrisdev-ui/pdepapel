"use server";

import prismadb from "@/lib/prismadb";

export async function getCategories(storeId: string) {
  return await prismadb.category.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      typeId: true,
      seoEnabled: true,
      seoFeatured: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      archivedAt: true,
      type: { select: { id: true, name: true } },
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });
}
