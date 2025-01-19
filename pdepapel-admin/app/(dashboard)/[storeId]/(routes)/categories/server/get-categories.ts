"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getCategories(storeId: string) {
  const categories = await prismadb.category.findMany({
    where: {
      storeId,
    },
    include: {
      type: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    typeName: category.type.name,
    createdAt: format(category.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
