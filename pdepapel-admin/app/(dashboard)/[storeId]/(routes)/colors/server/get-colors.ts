"use server";

import prismadb from "@/lib/prismadb";

export async function getColors(storeId: string) {
  return await prismadb.color.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      value: true,
      createdAt: true,
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
