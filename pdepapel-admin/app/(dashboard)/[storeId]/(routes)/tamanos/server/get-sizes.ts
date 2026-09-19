"use server";

import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

export async function getSizes(storeId: string) {
  await requireStoreOwner(storeId);
  return await prismadb.size.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      value: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      archivedAt: true,
      _count: { select: { products: true } },
    },
    // Por código: XS, XS+, S, S+… en el orden de la combinación.
    orderBy: { value: "asc" },
  });
}
