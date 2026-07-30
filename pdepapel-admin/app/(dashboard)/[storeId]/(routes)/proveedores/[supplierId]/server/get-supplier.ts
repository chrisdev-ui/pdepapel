"use server";

import prismadb from "@/lib/prismadb";

export async function getSupplier(id: string) {
  return await prismadb.supplier.findUnique({
    where: {
      id,
    },
  });
}
