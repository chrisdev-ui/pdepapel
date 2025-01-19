"use server";

import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function getSuppliers(storeId: string) {
  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId,
    },
    orderBy: {
      name: "asc",
    },
  });

  return suppliers.map((supplier) => ({
    ...supplier,
    createdAt: format(supplier.createdAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
    updatedAt: format(supplier.updatedAt, "dd 'de' MMMM 'de' yyyy", {
      locale: es,
    }),
  }));
}
