"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

export async function getPosts(storeId: string) {
  await requireStoreRead(storeId);
  return await prismadb.post.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
