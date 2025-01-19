"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getDesigns(storeId: string) {
  const designs = await prismadb.design.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return designs.map((design) => ({
    id: design.id,
    name: design.name,
    createdAt: format(design.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
    updatedAt: format(design.updatedAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
