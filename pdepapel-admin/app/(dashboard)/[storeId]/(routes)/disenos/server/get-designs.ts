"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

export async function getDesigns(storeId: string) {
  await requireStoreRead(storeId);
  return await prismadb.design.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      archivedAt: true,
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });
}
