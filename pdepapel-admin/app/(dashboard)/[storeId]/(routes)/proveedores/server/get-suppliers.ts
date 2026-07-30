"use server";

import prismadb from "@/lib/prismadb";

export async function getSuppliers(storeId: string) {
  return await prismadb.supplier.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}
