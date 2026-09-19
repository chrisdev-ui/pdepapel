"use server";

import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

/** Diseño para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getDesign(storeId: string, designId: string) {
  await requireStoreOwner(storeId);
  return await prismadb.design.findFirst({
    where: { id: designId, storeId },
  });
}
