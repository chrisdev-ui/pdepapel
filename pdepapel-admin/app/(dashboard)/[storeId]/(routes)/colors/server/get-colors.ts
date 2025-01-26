"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getColors(storeId: string) {
  const colors = await prismadb.color.findMany({
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

  return colors.map((color) => ({
    id: color.id,
    name: color.name,
    value: color.value,
    products: color._count.products,
    createdAt: format(color.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
