"use server";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getQuotations(storeId: string) {
  headers();
  return await prismadb.quotation.findMany({
    where: {
      storeId,
    },
    include: {
      items: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
