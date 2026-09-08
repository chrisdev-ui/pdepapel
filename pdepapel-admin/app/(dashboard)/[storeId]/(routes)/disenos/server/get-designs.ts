"use server";

import prismadb from "@/lib/prismadb";

export async function getDesigns(storeId: string) {
  return await prismadb.design.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      isArchived: true,
      archivedAt: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
