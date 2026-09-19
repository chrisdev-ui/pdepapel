"use server";

import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

/** Tamaño para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getSize(storeId: string, sizeId: string) {
  await requireStoreOwner(storeId);
  return await prismadb.size.findFirst({
    where: { id: sizeId, storeId },
  });
}
