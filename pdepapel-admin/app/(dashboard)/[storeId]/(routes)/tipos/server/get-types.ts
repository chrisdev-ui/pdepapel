"use server";

import prismadb from "@/lib/prismadb";

export async function getTypes(storeId: string) {
  return await prismadb.type.findMany({
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
          categories: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
