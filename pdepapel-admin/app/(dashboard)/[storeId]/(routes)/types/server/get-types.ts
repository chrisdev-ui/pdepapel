"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getTypes(storeId: string) {
  const types = await prismadb.type.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return types.map((type) => ({
    ...type,
    createdAt: format(type.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
    updatedAt: format(type.updatedAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
