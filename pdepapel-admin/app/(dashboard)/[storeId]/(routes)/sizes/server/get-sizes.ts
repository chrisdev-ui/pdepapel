"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getSizes(storeId: string) {
  const sizes = await prismadb.size.findMany({
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

  return sizes.map((size) => ({
    ...size,
    products: size._count.products,
    createdAt: format(size.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
