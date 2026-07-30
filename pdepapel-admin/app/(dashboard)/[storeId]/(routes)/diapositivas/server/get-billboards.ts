"use server";

import prismadb from "@/lib/prismadb";

export async function getBillboards(storeId: string) {
  return await prismadb.billboard.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
