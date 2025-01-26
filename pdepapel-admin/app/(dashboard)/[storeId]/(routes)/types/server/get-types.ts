"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getTypes(storeId: string) {
  const types = await prismadb.type.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
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

  return types.map((type) => ({
    ...type,
    categories: type._count.categories,
    createdAt: format(type.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
