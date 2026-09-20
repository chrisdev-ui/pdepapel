"use server";

import { requireStoreRead } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";

/** Color para el formulario de edición; `null` si no existe o es de otra tienda. */
export async function getColor(storeId: string, colorId: string) {
  await requireStoreRead(storeId);
  return await prismadb.color.findFirst({
    where: { id: colorId, storeId },
  });
}
