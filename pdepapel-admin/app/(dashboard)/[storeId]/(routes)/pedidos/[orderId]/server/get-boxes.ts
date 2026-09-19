"use server";

import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getBoxes(storeId: string) {
  await requireStoreOwner(storeId);
  headers();
  return await prismadb.box.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
