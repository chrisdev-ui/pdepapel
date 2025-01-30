"use server";

import prismadb from "@/lib/prismadb";

export async function getPosts(storeId: string) {
  return await prismadb.post.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
