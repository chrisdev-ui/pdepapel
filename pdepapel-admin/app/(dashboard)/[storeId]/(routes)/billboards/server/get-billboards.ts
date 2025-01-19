"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getBillboards(storeId: string) {
  const billboards = await prismadb.billboard.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return billboards.map((billboard) => ({
    id: billboard.id,
    label: billboard.label,
    title: billboard.title ?? "Sin título",
    image: billboard.imageUrl,
    redirectUrl: billboard.redirectUrl ?? "Sin link de redirección",
    createdAt: format(billboard.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
