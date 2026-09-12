"use server";

import prismadb from "@/lib/prismadb";

/** Categorías (modelo `Type`) de una tienda para las tablas del centro de Atributos. */
export async function getTypes(storeId: string) {
  return await prismadb.type.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      iconSvg: true,
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
