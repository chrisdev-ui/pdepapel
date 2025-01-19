"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getSizes(storeId: string) {
  const sizes = await prismadb.size.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return sizes.map((size) => ({
    ...size,
    createdAt: format(size.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
    updatedAt: format(size.updatedAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
