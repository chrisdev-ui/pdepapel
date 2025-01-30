"use server";

import prismadb from "@/lib/prismadb";

export async function getSizes(storeId: string) {
  return await prismadb.size.findMany({
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
