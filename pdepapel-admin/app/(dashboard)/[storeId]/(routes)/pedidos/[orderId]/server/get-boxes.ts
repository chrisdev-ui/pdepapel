"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { headers } from "next/headers";

export async function getBoxes(storeId: string) {
  await requireStoreRead(storeId);
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
