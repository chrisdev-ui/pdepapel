"use server";

import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

/** Solo devuelve publicaciones de la tienda indicada (aislamiento por tienda). */
export async function getPost(storeId: string, id: string) {
  await requireStoreOwner(storeId);
  return await prismadb.post.findFirst({
    where: {
      id,
      storeId,
    },
  });
}
