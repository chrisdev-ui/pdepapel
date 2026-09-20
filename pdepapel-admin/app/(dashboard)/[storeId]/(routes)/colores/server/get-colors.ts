"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

export async function getColors(storeId: string) {
  await requireStoreRead(storeId);
  return await prismadb.color.findMany({
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
    // Por nombre: así «Rosa pastel» y «Rosado» quedan juntos en la lista.
    orderBy: { name: "asc" },
  });
}
